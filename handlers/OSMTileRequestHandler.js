const BaseTileRequestHandler = require('./BaseTileRequestHandler');

module.exports = class OSMTileRequestHandler extends BaseTileRequestHandler {
    tbls = [{
        schema: 'public',
        table: 'planet_osm_polygon',
        srid: '3857',
        geomColumn: 'way',
        attrColumns: 'osm_id',
        filters: [{
            minZoom: 12,
            maxZoom: 23,
            filter: `building = 'yes'`
        }]
    },{
        schema: 'public',
        table: 'planet_osm_roads',
        srid: '3857',
        geomColumn: 'way',
        attrColumns: 'osm_id',
        filters: []
    },{
        schema: 'public',
        table: 'planet_osm_line',
        srid: '3857',
        geomColumn: 'way',
        attrColumns: 'osm_id',
        filters: []
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
