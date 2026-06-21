# TODO - Fix startupforge-server issue

- [x] Inspect current `index.js` (route registration / Mongo connection lifecycle)
- [x] Update `index.js` so `/opportunities` route is registered regardless of Mongo connection success
- [x] Validate `MONGO_DB_URI` and fail fast with a clear error message
- [x] Improve route error handling and return JSON with proper status code
- [x] Run the server (and optionally a quick curl/postman request) to verify endpoint works

