const pinoInspector = require('pino-inspector')
const fastify = require('fastify')({
    // http2: true,
    logger: {
        prettyPrint: true, level: 'info', prettifier: pinoInspector
    }
});
const path = require('path');
const { Pool } = require('pg');
const { brotliCompressSync } = require('zlib');
const topojson = require('topojson-server');
const geobuf = require('geobuf');
const Pbf = require('pbf');
const TownIITileRequestHandler = require('./handlers/TownIITileRequestHandler');
const MapserverTileRequestHandler = require('./handlers/MapserverTileRequestHandler');
const OSMTileRequestHandler = require('./handlers/OSMTileRequestHandler');

const dbConfig = {
    user: 'mapserver',
    password: 'CADIX2user',
    host: '100.102.162.100',
    port: 35432,
}
// DB
this.towniiPool = new Pool({...{
    database: 'townii_nagoya',
}, ...dbConfig});
this.msPool = new Pool({...{
    database: 'mapserver',
}, ...dbConfig});
this.osmPool = new Pool({...{
    database: 'osm_chubu',
}, ...dbConfig});

// 静的ファイルのルーティング
fastify.register(require('fastify-static'), {
    root: path.join(__dirname, 'public'),
});
fastify.register(require('fastify-compress'), {
    global: false,
    encodings: ['gzip', 'deflate'],
    customTypes: /x-protobuf$|vnd.mapbox-vector-tile$/
});

fastify.get('/hoge', (req, reply) => {
    reply.compress('Hello World!');
});

fastify.get('/tile/osm/**', async (req, reply) => {
    const handler = new OSMTileRequestHandler(this.osmPool);
    await handler.init();

    const tile = handler.pathToTile(req.req.url.replace(/^\/tile\/osm/, ''));
    if (!(tile && handler.tileIsValid(tile))) {
        reply.statusCode = 400;
        console.error(`invalid tile path: ${req.req.url}`);
        return;
    }
    
    const env = handler.tileToEnvelope(tile);
    const sql = handler.envelopeToSQL(tile, env);
    const pbf = await handler.sqlToPbf(sql);
    await handler.release();

    if (pbf.length == 0) {
        reply.statusCode = 204; // No content
        reply.headers({
            'Access-Control-Allow-Origin': '*',
        });
    } else {
        reply.statusCode = 200;
        reply.headers({
            'Access-Control-Allow-Origin': '*',
            'Content-type': 'application/vnd.mapbox-vector-tile',
        });
        reply.compress(Buffer.from(pbf));
    }
});

fastify.get('/tile/townii/**', async (req, reply) => {
    const handler = new TownIITileRequestHandler(this.towniiPool);
    await handler.init();

    const tile = handler.pathToTile(req.req.url.replace(/^\/tile\/townii/, ''));
    if (!(tile && handler.tileIsValid(tile))) {
        reply.statusCode = 400;
        console.error(`invalid tile path: ${req.req.url}`);
        return;
    }
    
    const env = handler.tileToEnvelope(tile);
    const sql = handler.envelopeToSQL(tile, env);
    const pbf = await handler.sqlToPbf(sql);
    await handler.release();

    if (pbf.length == 0) {
        reply.statusCode = 204; // No content
        reply.headers({
            'Access-Control-Allow-Origin': '*',
        });
    } else {
        reply.statusCode = 200;
        reply.headers({
            'Access-Control-Allow-Origin': '*',
            'Content-type': 'application/vnd.mapbox-vector-tile',
        });
        reply.compress(Buffer.from(pbf));
    }
});

fastify.get('/tile/ms/**', async (req, reply) => {
    const handler = new MapserverTileRequestHandler(this.msPool);
    await handler.init();
    const tile = handler.pathToTile(req.req.url.replace(/^\/tile\/ms/, ''));
    if (!(tile && handler.tileIsValid(tile))) {
        reply.statusCode = 400;
        console.error(`invalid tile path: ${req.req.url}`);
        return;
    }

    const env = handler.tileToEnvelope(tile);
    const sql = handler.envelopeToSQL(tile, env);
    const pbf = await handler.sqlToPbf(sql);
    await handler.release();

    if (pbf.length == 0) {
        reply.statusCode = 204; // No content
        reply.headers({
            'Access-Control-Allow-Origin': '*',
        });
    } else {
        reply.statusCode = 200;
        reply.headers({
            'Access-Control-Allow-Origin': '*',
            'Content-type': 'application/vnd.mapbox-vector-tile',
        });
        reply.compress(Buffer.from(pbf));
    }
});

fastify.get('/feature/:table/:z/:x/:y', async (req, reply) => {
    const handler = new MapserverTileRequestHandler(this.msPool);
    await handler.init();
    const tile = handler.pathToTile(req.req.url.replace(/^\/feature/, ''));
    const env = handler.tileToEnvelope(tile);
    const bounds = handler.envelopeToBoundsSQL(env);

    console.log(`*** bounds=${bounds}`);
    const client = await this.msPool.connect();
    const query = `
        select json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(ST_AsGeoJSON(t.*)::json)
        ) AS geojson
        from (
            select ST_Transform(the_geom, 4326) AS geom, * from mapserver.${tile.layer}
            WHERE the_geom && ${bounds}
        ) AS t
    `;
    console.log(`*** SQL = ${query}`)
    const result = await client.query(query);
    await client.release(true);

    const geojson = result.rows[0].geojson;
    if (geojson.features == null) {
        reply.statusCode = 204; // No content
        reply.headers({
            'Access-Control-Allow-Origin': '*',
        });
    } else {
        const buffer = geobuf.encode(geojson, new Pbf());
        reply.code(200)
            .type('application/x-protobuf')
            .header('Access-Control-Allow-Origin', '*')
            .compress(Buffer.from(buffer));
    }
});

fastify.get('/feature/:table', async (req, reply) => {
    console.log(`*** /feature/${req.params.table}`)
    const bbox = req.query['bbox'] ? req.query['bbox'].split(','): null;
    const srs = req.query['srs'] ? req.query['srs']: 3857;
    const client = await this.msPool.connect();
    let where = '';
    if (bbox && bbox.length == 4) {
        const segSize = (bbox[2] - bbox[0]) / 4;
        where = `WHERE the_geom && ST_Segmentize(ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, ${srs}), ${segSize})`;
    }
    const query = `
        select json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(ST_AsGeoJSON(t.*)::json)
        ) AS geojson
        from (
            select *, '${req.params.table}' AS layer from mapserver.${req.params.table}
            ${where}
        ) AS t
    `;
    const result = await client.query(query);
    await client.release(true);

    const geojson = result.rows[0].geojson;
    if (geojson.features == null) {
        geojson.features = [];
    }

    const buffer = geobuf.encode(geojson, new Pbf());
    reply.code(200)
        .type('application/x-protobuf')
        .header('Access-Control-Allow-Origin', '*')
        .compress(Buffer.from(buffer));
});

fastify.get('/path/:table(\\w+).pbf', async (req, reply) => {
    console.log(`*** /path/${req.params.table}`)
    const bbox = req.query['bbox'] ? req.query['bbox'].split(','): null;
    const srs = req.query['srs'] ? req.query['srs']: 3857;
    const client = await this.msPool.connect();
    let where = '';
    if (bbox && bbox.length == 4) {
        const segSize = (bbox[2] - bbox[0]) / 4;
        where = `WHERE the_geom && ST_Transform(ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, 4326), 3857)`;
    }
    const query = `
        select json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(ST_AsGeoJSON(t.*)::json)
        ) AS geojson
        from (
            select ST_Transform(the_geom, 4326), *, 'g_messen' AS layerName from mapserver.${req.params.table}
            ${where}
        ) AS t
    `;
    // console.log(`*** SQL = ${query}`)
    const result = await client.query(query);
    await client.release(true);

    const geojson = result.rows[0].geojson;
    if (geojson.features == null) {
        geojson.features = [];
    }

    // console.log('>>>geojson',geojson)
    // const paths = geojson.features.map(f => {
    //     return {
    //         ...f.properties,
    //         path: [...f.geometry.coordinates.map(c => [...c, 9])],
    //     }
    // })

    const buffer = geobuf.encode(geojson, new Pbf());
    reply.code(200)
        .type('application/x-protobuf')
        // .type('text/json')
        .header('Access-Control-Allow-Origin', '*')
        .compress(Buffer.from(buffer));
        // .compress(paths);
});

fastify.get('/func/facilityonmessen.pbf', async (req, reply) => {
    console.log(`*** /func/facilityonmessen`)
    const bbox = req.query['bbox'] ? req.query['bbox'].split(','): null;
    const srs = req.query['srs'] ? req.query['srs']: 3857;
    const client = await this.msPool.connect();
    let where = 'WHERE ST_Length(the_geom) > 2';
    if (bbox && bbox.length == 4) {
        where += ` AND the_geom && ST_Transform(ST_MakeEnvelope(${bbox[0]}, ${bbox[1]}, ${bbox[2]}, ${bbox[3]}, 4326), 3857)`;
    }
    const query = `
        select json_build_object(
            'type', 'FeatureCollection',
            'features', json_agg(ST_AsGeoJSON(t.*)::json)
        ) AS geojson
        from (
            SELECT dbf_id, 
            degrees(ST_Azimuth(ST_StartPoint(the_geom), ST_LineInterpolatePoint(the_geom, 2 / ST_Length(the_geom)))) AS angle,
            'facilityonmessen' AS layerName, ST_Transform(ST_LineInterpolatePoint(the_geom, 2 / ST_Length(the_geom)), 4326) AS the_geom FROM mapserver.g_messen
            ${where}
        ) AS t
    `;
    const result = await client.query(query);
    await client.release(true);

    const geojson = result.rows[0].geojson;
    if (geojson.features == null) {
        geojson.features = [];
    }

    // console.log('>>>geojson',geojson)
    // const paths = geojson.features.map(f => {
    //     return {
    //         ...f.properties,
    //         path: [...f.geometry.coordinates.map(c => [...c, 9])],
    //     }
    // })

    const buffer = geobuf.encode(geojson, new Pbf());
    reply.code(200)
        .type('application/x-protobuf')
        // .type('text/json')
        .header('Access-Control-Allow-Origin', '*')
        .compress(Buffer.from(buffer));
        // .compress(paths);
});

// fastify.get('/feature/:layer', async (req, reply) => {
//     console.log(`*** /feature/${req.params.table}`)
//     const bbox = req.query['bbox'] ? req.query['bbox'].split(','): null;
//     const srs = req.query['srs'] ? req.query['srs']: 3857;

//     const handler = new MapserverTileRequestHandler(this.msPool);
//     await handler.init();

//     const env = {
//         xmin: bbox[0],
//         ymin: bbox[1],
//         xmax: bbox[2],
//         ymax: bbox[3],
//         layer: req.params['layer']
//     }
    
//     const sql = handler.envelopeToSQL(env);
//     console.log(sql);
//     const pbf = await handler.sqlToPbf(sql);
//     await handler.release();

//     reply.statusCode = 200;
//     reply.headers({
//         'Access-Control-Allow-Origin': '*',
//         'Content-type': 'application/vnd.mapbox-vector-tile',
//     });
//     reply.compress(Buffer.from(pbf));
// });

// Run the server!
fastify.listen(3001, '0.0.0.0', (err, address) => {
    if (err) throw err;
    fastify.log.info(`server listening on ${address}`);
})

