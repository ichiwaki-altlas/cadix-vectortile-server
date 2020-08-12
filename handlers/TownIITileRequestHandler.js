const BaseTileRequestHandler = require('./BaseTileRequestHandler');

module.exports = class TownIITileRequestHandler extends BaseTileRequestHandler {
    tbls = [{
        schema: 'public',
        table: 'poly_house',
        srid: '3857',
        geomColumn: 'the_geom',
        attrColumns: 'gid, layer as _layer, map_code, kind_code',
        filters: []
    },{
        schema: 'public',
        table: 'poly_ug',
        srid: '3857',
        geomColumn: 'the_geom',
        attrColumns: 'gid, layer as _layer, map_code',
        filters: []
    },{
        schema: 'public',
        table: 'poly_water',
        srid: '3857',
        geomColumn: 'the_geom',
        attrColumns: 'gid, layer as _layer, map_code',
        filters: []
    },{
        schema: 'public',
        table: 'line_river',
        srid: '3857',
        geomColumn: 'the_geom',
        attrColumns: 'gid, layer as _layer, map_code',
        filters: []
    },{
        schema: 'public',
        table: 'line_train',
        srid: '3857',
        geomColumn: 'the_geom',
        attrColumns: 'gid, layer as _layer, map_code',
        filters: []
    },{
        schema: 'public',
        table: 'text_house',
        srid: '3857',
        geomColumn: 'the_geom',
        attrColumns: 'layer as _layer, height, angle, shrink_dir, shrink_rat, txt_dir, txt_str',
        filters: []
    },{
        schema: 'public',
        table: 'line_road',
        srid: '3857',
        geomColumn: 'the_geom',
        attrColumns: 'gid, layer as _layer, map_code',
        filters: [{
            minZoom: 10,
            maxZoom: 23,
            filter: 'layer NOT IN (21, 58, 61, 63, 64, 67, 78, 65, 66)'
        },{
            minZoom: 14,
            maxZoom: 23,
            filter: 'layer IN (21, 58, 61, 63, 64, 67, 78)'
        },{
            minZoom: 16,
            maxZoom: 23,
            filter: 'layer IN (65, 66)'
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
                SELECT ST_AsMVTGeom(ST_Transform(t.${tbl.geomColumn}, 3857), bounds.b2d) AS geom, 
                    ${tbl.attrColumns}
                FROM ${tbl.schema}.${tbl.table} t, bounds
                WHERE ${where} ST_Intersects(t.${tbl.geomColumn}, ST_Transform(bounds.geom, ${tbl.srid}))
            ) 
            SELECT ST_AsMVT(mvtgeom.*, '${tbl.table}') FROM mvtgeom;
        `;

        return [sql];
    }
}
