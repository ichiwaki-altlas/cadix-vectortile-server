module.exports = class BaseTileRequestHandler {
    #pool;
    #client;

    // Width of world in EPSG:3857
    #worldMercMax = 20037508.3427892;
    #worldMercMin = -1 * this.#worldMercMax;
    #worldMercSize = this.#worldMercMax - this.#worldMercMin;
    
    constructor(pool) {
        this.#pool = pool;
    }

    async init() {
        try {
            this.#client = await this.#pool.connect();
        } catch (err) {
            throw err;
        }
    }

    async release() {
        await this.#client.release(true);
    }

    // Search REQUEST_PATH for /{z}/{x}/{y}.{format} patterns
    pathToTile(path) {
        const match = path.match(/^\/(\w+)\/(\d+)\/(\d+)\/(\d+)\.(\w+)/);
        if (match) {
            return {
                'table': match[1],
                'zoom': parseInt(match[2]),
                'x': parseInt(match[3]),
                'y': parseInt(match[4]),
                'format': match[5]
            }
        } else {
            return null;
        }
    }


    // Do we have all keys we need? 
    // Do the tile x/y coordinates make sense at this zoom level?
    tileIsValid(tile) {
        if (!(tile.hasOwnProperty('x') && tile.hasOwnProperty('y') && tile.hasOwnProperty('zoom'))) {
            return false;
        }

        if (!tile.hasOwnProperty('format') || !['pbf', 'mvt'].includes(tile.format)) {
            return false;
        }

        const size = 2 ** tile.zoom;
        if (tile.x >= size || tile.y >= size) {
            return false;
        }

        if (tile.x < 0 || tile.y < 0) {
            return false;
        }

        return true
    }


    // Calculate envelope in "Spherical Mercator" (https://epsg.io/3857)
    tileToEnvelope(tile) {
        // Width in tiles
        const worldTileSize = 2 ** tile.zoom;
        // Tile width in EPSG:3857
        const tileMercSize = this.#worldMercSize / worldTileSize
        // Calculate geographic bounds from tile coordinates
        // XYZ tile coordinates are in "image space" so origin is
        // top-left, not bottom right
        const env = {};
        env['xmin'] = this.#worldMercMin + tileMercSize * tile.x;
        env['xmax'] = this.#worldMercMin + tileMercSize * (tile.x + 1);
        env['ymin'] = this.#worldMercMax - tileMercSize * (tile.y + 1);
        env['ymax'] = this.#worldMercMax - tileMercSize * (tile.y);
        env['table'] = tile.table;

        return env
    }

    // Generate SQL to materialize a query envelope in EPSG:3857.
    // Densify the edges a little so the envelope can be
    // safely converted to other coordinate systems.
    envelopeToBoundsSQL(envelope) {
        const DENSIFY_FACTOR = 4;
        envelope['segSize'] = (envelope['xmax'] - envelope['xmin']) / DENSIFY_FACTOR;
        const sql_tmpl = `ST_Segmentize(ST_MakeEnvelope(${envelope.xmin}, ${envelope.ymin}, ${envelope.xmax}, ${envelope.ymax}, 3857),${envelope.segSize})`;
        return sql_tmpl;
    }

    // Run tile query SQL and return error on failure conditions
    async sqlToPbf(sqls) {
        // Make and hold connection to database
        if (!this.#client) {

        }

        // Query for MVT
        const promises = [];
        for (let i = 0; i < sqls.length; i++) {
            const sql = sqls[i];
            promises.push(this.#client.query(sql));
        }

        const results = await Promise.all(promises);
        const totalSize = results.reduce((sum, r) => {
            return sum + r.rows[0].st_asmvt.byteLength;
        }, 0);
        console.log('totalSize', totalSize);
        let combined = new Uint8Array(totalSize);
        let size = 0;
        for (let i = 0, size = 0; i < results.length; i++) {
            combined.set(results[i].rows[0].st_asmvt, size);
            size += results[i].rows[0].st_asmvt.byteLength;
            console.log(size);
        }
        
        return combined;
    }
}
