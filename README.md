# cadix-vectortile-server

## 概要

このリポジトリはPostgreSQL、PostGISデータベースから直接データを抽出し、Geoserverを介さずにベクトルデータを配信するサーバーアプリケーション



### データベース

背景地図にTOWN-II、設備データにmapserverのデータベースが必要



## 使い方

1. リポジトリからクローン

   ```bash
   git clone https://github.com/ichiwaki-altlas/cadix-vectortile-client-ol.git
   cd cadix-vectortile-client-ol
   rm -rf .git
   ```

2. 依存関係のインストール

   ```bash
   npm i
   ```

3. データベースの接続情報を編集

   ###### server.js

   ```javascript
   const dbConfig = {
       user: 'postgres',
       password: 'postgres',
       host: '172.19.128.1',
       port: 5433,
   }
   // DB
   this.towniiPool = new Pool({...{
       database: 'townii_nagoya',
   }, ...dbConfig});
   this.msPool = new Pool({...{
       database: 'mapserver203',
   }, ...dbConfig});
   this.osmPool = new Pool({...{
       database: 'osm_chubu',
   }, ...dbConfig});
   ```

   * townii_nagoya

     * TOWN-IIの名古屋エリアが格納されているデータベース
     * 従来のCadix-MapServerで背景地図として利用しているDBそのままでOK

     https://github.com/ichiwaki-altlas/cadix-vectortile-client-ol で利用

   * mapserver203

     * Cadix-MapServerで利用している設備情報データベース

     https://github.com/ichiwaki-altlas/cadix-vectortile-client-ol で利用

   * osm_chubu

     * OpenStreetMapの中部エリアを格納したデータベース

     https://github.com/ichiwaki-altlas/cadix-deckgl で利用

4. 実行

   ```bash
   npm start
   ```

