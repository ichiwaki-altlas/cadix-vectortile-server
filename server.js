const fastify = require('fastify')({
    // http2: true,
    logger: true,
});
const path = require('path');
const { Pool, Client } = require('pg');
const { brotliCompressSync } = require('zlib');
const topojson = require('topojson-server');
const geobuf = require('geobuf');
const Pbf = require('pbf');
const TownIITileRequestHandler = require('./handlers/TownIITileRequestHandler');
const MapserverTileRequestHandler = require('./handlers/MapserverTileRequestHandler');
const OSMTileRequestHandler = require('./handlers/OSMTileRequestHandler');

const dbConfig = {
    user: 'postgres',
    password: 'postgres',
    host: '100.123.204.103',
    port: 6432,
}
// DB
this.msPool = new Client({...{
    database: 'postgres',
}, ...dbConfig});


fastify.get('/path/:table(\\w+).pbf', async (req, reply) => {
    console.log(`*** /path/${req.params.table}`)
    const bbox = req.query['bbox'] ? req.query['bbox'].split(','): null;
    const srs = req.query['srs'] ? req.query['srs']: 3857;

    const client = new Client({
        database: 'postgres',
        user: 'postgres',
        password: 'postgres',
        host: '100.123.204.103',
        port: 5432,
    });
    await client.connect();

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
    await client.end();

    const geojson = result.rows[0].geojson;
    if (geojson.features == null) {
        geojson.features = [];
    }   

    const buffer = geobuf.encode(geojson, new Pbf());
    reply.code(200)
        .type('application/x-protobuf')
        // .type('text/json')
        .header('Access-Control-Allow-Origin', '*')
        //.compress(Buffer.from(buffer));
        // .compress(paths);
     return reply.send(buffer);
});

fastify.get('/func/facilityonmessen.pbf', async (req, reply) => {
    console.log(`*** /func/facilityonmessen`)
    const bbox = req.query['bbox'] ? req.query['bbox'].split(','): null;
    const srs = req.query['srs'] ? req.query['srs']: 3857;

    const client = new Client({
        database: 'postgres',
        user: 'postgres',
        password: 'postgres',
        host: '100.123.204.103',
        port: 5432,
    }); 
    await client.connect();

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
    await client.end();

    const geojson = result.rows[0].geojson;
    if (geojson.features == null) {
        geojson.features = []; 
    }   

    const buffer = geobuf.encode(geojson, new Pbf());
    reply.code(200)
        .type('application/x-protobuf')
        // .type('text/json')
        .header('Access-Control-Allow-Origin', '*')
        //.compress(Buffer.from(buffer));
        // .compress(paths);
    return reply.send(buffer);
});
