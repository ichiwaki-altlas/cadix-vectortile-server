const fastify = require('fastify')({
  logger: true,
});
const { Pool } = require('pg');
const geobuf = require('geobuf');
const Pbf = require('pbf');

const pool = new Pool({
  user: 'postgres',
  password: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'postgres',
});


fastify.get('/path/:table(\\w+).pbf', async (req, reply) => {
  console.log(`*** /path/${req.params.table}`)
  const bbox = req.query['bbox'] ? req.query['bbox'].split(','): null;
  const srs = req.query['srs'] ? req.query['srs']: 3857;

  const client = await pool.connect();

  try {
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

    const result = await client.query(query);

    const geojson = result.rows[0].geojson;
    if (geojson.features == null) {
      geojson.features = [];
    }   

    const buffer = geobuf.encode(geojson, new Pbf());
    reply.code(200)
      .type('application/x-protobuf')
      .header('Access-Control-Allow-Origin', '*');

    return reply.send(buffer);
  } finally {
    await client.release();
  }
});

fastify.get('/func/facilityonmessen.pbf', async (req, reply) => {
  console.log(`*** /func/facilityonmessen`)
  const bbox = req.query['bbox'] ? req.query['bbox'].split(','): null;
  const srs = req.query['srs'] ? req.query['srs']: 3857;

  const client = await pool.connect();

  try {
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
      .header('Access-Control-Allow-Origin', '*');
    
    return reply.send(buffer);
  } finally {
    await client.release();
  }
});


fastify.listen({ port: 3001, host: '0.0.0.0' }, (err, address) => {
  if (err) throw err
  fastify.log.info(`server listening on ${address}`);
})
