const express = require('express');
const app = express();
const port = 3000;

const Spotify = require('./utils/nodejs-spotify-api');
const Deezer = require('./utils/nodejs-deezer-api');

let spotify_api;
let deezer_api;

app.use(express.static('./views'));

app.post(`/credentials`, async (req, res) => {
	const {
		body: {
			spotify_client_id, spotify_client_secret, spotify_authorization_code, spotify_redirect_uri,
			deezer_application_id, deezer_secret, deezer_redirect_uri, deezer_authorization_code
		}
	} = req;
	
	const spotify_credentials = {
		client_id = spotify_client_id,
		client_secret = spotify_client_secret,
		authorization_code = spotify_authorization_code,
		redirect_uri = spotify_redirect_uri
	};
	spotify_api = new Spotify(spotify_credentials);

	const deezer_credentials = {
		application_id = deezer_application_id,
		secret = deezer_secret,
		redirect_uri = deezer_redirect_uri,
		authorization_code = deezer_authorization_code
	};
	deezer_api = new Deezer(deezer_credentials);
});

app.listen(port, () => {
	console.log(`[Deezer2Spotify] - Access to app at http://localhost:${port}`);
});