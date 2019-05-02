'use strict';

require('dotenv').config();
const superagent = require('superagent');
const express = require('express');
const app = express();
const cors = require('cors');
const pg = require('pg');
const PORT = process.env.PORT || 3000;

app.use(cors());

const client = new pg.Client(process.env.DATABASE_URL);
client.connect();

app.get('/hello', (request, response) => {
  response.status(200).send('Hello');
});

app.get('/location', (request, response) => {
  let sqlStatement = 'SELECT * FROM location WHERE search_query = $1;';
  let sqlInsertStatement = 'INSERT INTO location (search_query, formatted_query, latitude, longitude) VALUES ( $1, $2, $3, $4);';
  let geocodeURL = `https://maps.googleapis.com/maps/api/geocode/json?address=${request.query.data}&key=${process.env.GEOCODE_API_KEY}`;
  console.log('Location: ',geocodeURL);

  getData(request.query.data, sqlStatement, sqlInsertStatement, geocodeURL, Location)
    .then(location => response.send(location))
    .catch(error => handleError(error, response));
});

function handleError(error, response) {
  //console.log(error);
  if (response) response.status(500).send('Sorry, something went wrong');
}

function getData(query, sqlStatement, sqlInsertStatement, apiURL, Constructor) {
  let values = [ query ];
  return client.query(sqlStatement, values)
    .then((data) => {
      if (data.rowCount > 0) {
        // Somne fuction for databse
        return recordsExists(data);
      } else {
        return recordsDontExist(query, sqlInsertStatement, apiURL, Constructor);
      }
    });
}

// Function for if records exist
function recordsExists(data){
  // Test case for location
  console.log('DB DATA: ', data.rows[0]);
  if(data.rows.length === 1) return data.rows[0];
  else return data.rows;
}

// Functions for if records don't exist
function recordsDontExist(query, sqlInsertStatement, apiURL, Constructor){
  return superagent.get(apiURL)
    .then(res => {
      //console.log('API DATA', res.body);
      // Some fuction for API
      let tempObject = new Constructor(query, res);
      console.log(tempObject);
      let objectLength = 0;
      // Set lengths based on constructor
      console.log(Constructor);
      if(Constructor === Weather){
        objectLength = tempObject.dailyForecast.length;
      }
      if(Constructor === Location){
        objectLength = 1;
      }
      console.log(objectLength);
      for(let i = 0; i < objectLength; i++){
        let insertValues;
        //Handle different constructors
        if(Constructor === Weather){
          insertValues = Object.values(tempObject.dailyForecast[i]);
          insertValues.unshift(query.formatted_query);
        }else if(Constructor === Location){
          insertValues = Object.values(tempObject);
          console.log(insertValues);
        }
        client.query(sqlInsertStatement, insertValues);
        console.log('inserted to DB');
      }
      console.log('returning to send', tempObject);
      return tempObject;
    })
    .catch(err => handleError(err));
}

app.get('/weather', (request, response) => {
  const lat = request.query.data.latitude;
  const lng = request.query.data.longitude;
  let sqlStatement = 'SELECT summary, time FROM weather WHERE formatted_query = $1;';
  let sqlInsertStatement = 'INSERT INTO weather(formatted_query, summary, time) VALUES ( $1, $2, $3);';
  const weatherURL =`https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${lat},${lng}`;
  getData(request.query.data, sqlStatement, sqlInsertStatement, weatherURL, Weather)
    .then(weather => response.send(weather.dailyForecast))
    .catch(error => handleError(error, response));
});

app.get('/events', (request, response) => {
  const lat = request.query.data.latitude;
  const lng = request.query.data.longitude;
  const eventURL =`https://www.eventbriteapi.com/v3/events/search?location.longitude=${lng}&location.latitude=${lat}&expand=venue&token=${process.env.EVENTBRITE_API_KEY}`;
  superagent.get(eventURL)
    .end((err, res) => {
      if (err && err.status !== 200) {
        const errorResponse500 = {'status': 500, 'responseText': 'Sorry, something went wrong' };
        response.status(500).send(errorResponse500);
      } else {
        const event = new Event(res);
        response.status(200).send(event.events);
      }
    });
});


app.use('*', (request, response) => response.send('Sorry, that route does not exist.'));

app.listen(PORT,() => console.log(`Listening on port ${PORT}`));

const Location = function(searchQuery, jsonData) {
  const formattedQuery = jsonData.body['results'][0]['formatted_address'];
  const latitude = jsonData.body['results'][0]['geometry']['location']['lat'];
  const longitude = jsonData.body['results'][0]['geometry']['location']['lng'];

  this.search_query = searchQuery;
  this.formatted_query = formattedQuery;
  this.latitude = latitude;
  this.longitude = longitude;
};

const Weather = function(query, jsonData) {
  this.dailyForecast = [...jsonData.body.daily.data].map(forecast => {
    const summary = forecast['summary'];
    const time = (new Date(forecast['time'] * 1000)).toDateString();
    return {
      'forecast': summary,
      'time': time
    };
  });
};

const Event = function(jsonData) {
  this.events = [...jsonData.body.events].slice(0, 20).map((event) => {
    const link = event.url;
    const name = event.name.text;
    const event_date = new Date(event.start.utc).toDateString();
    const summary = event.description.text;

    return {
      'link': link,
      'name': name,
      'event_date': event_date,
      'summary': summary
    };
  });
};
