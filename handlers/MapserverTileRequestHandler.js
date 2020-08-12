const BaseTileRequestHandler = require('./BaseTileRequestHandler');

module.exports = class MapserverTileRequestHandler extends BaseTileRequestHandler {
    tbls = [{
        schema: 'mapserver',
        table: 'g_messen',
        srid: '3857',
        // geomColumn: 'the_geom',
        geomColumn: `ST_Buffer(the_geom, 0.1, 'endcap=flat join=round')`,
        filters: [{
            minZoom: 1,
            maxZoom: 11,
            filter: `1 <> 1`
        }, {
            minZoom: 12,
            maxZoom: 19,
            filter: `mrf_attr_6 = 1 AND mrf_attr_26 IN ('0', '4')`
        }]
    },{
        schema: 'mapserver',
        table: 'g_pole',
        srid: '3857',
        // geomColumn: 'the_geom',
        geomColumn: `ST_Buffer(the_geom, 0.5, 'quad_segs=8')`,
        filters: [{
            minZoom: 1,
            maxZoom: 11,
            filter: `1 <> 1`
        }, {
            minZoom: 12,
            maxZoom: 23,
            filter: `f_seq_no = 1 AND mrf_attr_6 = 6`
        }]
    },{
        schema: 'mapserver',
        table: 'g_cable_fl',
        srid: '3857',
        geomColumn: 'the_geom',
        filters: [{
            minZoom: 1,
            maxZoom: 19,
            filter: '1 = 1'
        }]
    },{
        schema: 'mapserver',
        table: 'g_cable_tl',
        srid: '3857',
        geomColumn: 'the_geom',
        filters: [{
            minZoom: 1,
            maxZoom: 19,
            filter: '1 = 1'
        }]
    }];

    // Generate a SQL query to pull a tile worth of MVT data
    // from the table of interest.        
    envelopeToSQL(tile, envelope) {
        
        const bounsSql = this.envelopeToBoundsSQL(envelope);
        const tbl = this.tbls.filter(t => t.table == envelope.table)[0];
        const filters = tbl.filters.filter(f => f.maxZoom >= tile.zoom && tile.zoom >= f.minZoom).map(f => f.filter);
        const where = (filters && filters.length) ? `(${filters.join(' OR ')}) AND` : '';

        // Materialize the bounds
        // Select the relevant geometry and clip to MVT bounds
        // Convert to MVT format
        const sql = `
            WITH 
            bounds AS (
                SELECT ${bounsSql} AS geom, 
                    ${bounsSql}::box2d AS b2d
            ),
            mvtgeom AS (
                SELECT ST_AsMVTGeom(ST_Transform(${tbl.geomColumn}, 3857), bounds.b2d) AS geom, t.*
                FROM ${tbl.schema}.${tbl.table} t, bounds
                WHERE ${where} ST_Intersects(${tbl.geomColumn}, ST_Transform(bounds.geom, ${tbl.srid}))
            ) 
            SELECT ST_AsMVT(mvtgeom.*, '${tbl.table}') FROM mvtgeom;
        `;

        return [sql];
    }
}
