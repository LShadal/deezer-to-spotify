const express = require('express');
const open = require('open');
const get_port = require('get-port');
const Spotify = require('./utils/spotify-api');
const Deezer = require('./utils/deezer-api');
const path = require('path');

const spotify_client_id = '353a17365652476da94bf2a8932e88f2';
const spotify_client_secret = 'fba056e82b914d5483c7db38ee686178';
const spotify_perms = [
  'user-read-email',
  'user-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-read-private',
  'playlist-modify-private'
];

const deezer_application_id = '484042';
const deezer_secret = '0a76d1648c66d1d2377d4902bc76c284';
const deezer_perms = [
	'basic_access',
	'email',
	'manage_library',
	'delete_library',
	'offline_access'
];

let spotify_api;
let deezer_api;

async function main() {
	const PORT = await get_port({ port: 3000 });
	const BASE_URL = `http://localhost:${PORT}`

	const app = express();

	app.use('/', express.static(path.join(__dirname, 'www')));
	
	app.get(`/login`, (req, res) => {
		res.redirect(
			'https://accounts.spotify.com/authorize?response_type=code&client_id='
			+ spotify_client_id
			+ '&scope='
			+ encodeURIComponent(spotify_perms.join(' '))
			+ '&redirect_uri='
			+ encodeURIComponent(`${BASE_URL}/callback/spotify`)
		);
	});

	app.get(`/callback/spotify`, async (req, res) => {
		const spotify_credentials = {
			client_id: spotify_client_id,
			client_secret: spotify_client_secret,
			redirect_uri: `${BASE_URL}/callback/spotify`,
			authorization_code: req.query.code
		};
		spotify_api = new Spotify(spotify_credentials);
		await spotify_api.get_access_token();
		await spotify_api.get_current_user();

		res.redirect(
			'https://connect.deezer.com/oauth/auth.php?app_id='
			+ deezer_application_id
			+ '&redirect_uri='
			+ encodeURIComponent(`${BASE_URL}/callback/deezer`)
			+ '&perms='
			+ encodeURIComponent(deezer_perms.join(','))
		);
	});
	
	app.get(`/callback/deezer`, async (req, res) => {
		const deezer_credentials = {
			application_id: deezer_application_id,
			secret: deezer_secret,
			redirect_uri: `${BASE_URL}/callback/deezer`,
			authorization_code: req.query.code
		};
		deezer_api = new Deezer(deezer_credentials);
		await deezer_api.get_access_token();

		res.redirect(`${BASE_URL}/home.html`);
	});

	app.get(`/start`, async (req, res) => {
		const formatted_playlists = [];
		let playlists;
		let errors = { total: 0, details: {} };

		try {
			playlists = await deezer_api.get_current_user_playlists_with_tracks();
		}
		catch(err) {
			return res.json({ message: 'an error occurred! '});
		}
		
		for(const playlist of playlists) {
			const p = {
				name: playlist.title.toLowerCase().replace(/ +/g, '_'),
				tracks: []
			};

			console.log(`---- ${p.name} ----`)

			errors.details[p.name] = [];
			const current_playlist_errors = [];
			for(const track of playlist.tracks) {
				try {
					console.log(`Searching ${track.title_short} by ${track.artist.name}...`);
					p.tracks.push(await spotify_api.search_track(track.title_short, track.artist.name));
				}
				catch(err) {
					current_playlist_errors.push(`${track.artist.name} - ${track.title_short}`);
				}
			}

			errors.details[p.name] = current_playlist_errors;
			errors.totals = errors.totals + current_playlist_errors.length;
			formatted_playlists.push(p);

			console.log(`---- end of ${p.name} ----`)
		}
		
		try {
			for(const playlist of formatted_playlists) {
				const playlist_to_create = `deezer_${playlist.name}`;

				console.log(` `);
				console.log(`Currently processing ${playlist_to_create} creation...`);
				const { id } = await spotify_api.create_playlist(playlist_to_create);
				console.log(`${playlist_to_create} created!`);

				console.log(` `);
				console.log(`Preparing ${playlist_to_create}'s datas to upload...`);
				const playlists_tracks = playlist.tracks.map(t => t.uri);

				const number_of_tracks_per_slice = 100;
				const number_of_parts_to_add = Math.ceil(playlists_tracks.length / number_of_tracks_per_slice);
				const tracks_slices_to_add = new Array(number_of_parts_to_add)
					.fill(0)
					.map((_ , i) => i)
					.map(i => playlists_tracks.slice(i * number_of_tracks_per_slice, (i + 1) * number_of_tracks_per_slice));

				for (const tracks of tracks_slices_to_add) {
					await spotify_api.add_tracks_to_playlist(id, tracks);
				}				

				console.log(`Tracks added to ${playlist_to_create} on Spotify!`);
			}
			
			console.log(` `);
			console.log(`Total errors: ${errors.total}`);
			if(errors.total > 0) {
				for(const playlist_name in errors.details) {
					if(errors.details[playlist_name].length <= 0) {
						console.log(` `);
						console.log(`No errors during ${playlist_name} transfer`);
						console.log(` `);
					}
					else {
						console.log(` `);
						console.log(`${errors.details[playlist_name].length} error(s) during ${playlist_name} transfer`);
						console.log(`Detailed errors in ${playlist_name}:`);
						console.log(errors.details[playlist_name]);
						console.log(` `);
					}
				}
			}

			console.log(` `);
			console.log(`[Deezer2Spotify] - Job done!`);
			console.log(` `);

			res.json({ 
				message: 'success',
				errors
			});

			console.log(`[Deezer2Spotify] - You can now close the web browser and this window!`);
		}
		catch(err) {
			res.json({ message: 'an error occurred!' });
		}
	});
	
	app.listen(PORT, async () => {
		console.log(`[Deezer2Spotify] - Started!`);
		console.log(`[Deezer2Spotify] - Please don't close this window!`);
		await open(`${BASE_URL}/login`);
	});
}

main();