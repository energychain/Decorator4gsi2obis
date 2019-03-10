const gsi2obis = require('../lib/gsi2obis');
const moment = require("moment");


// Create a nice array for tomorrow (96 values)
let nextMidNight = moment().startOf('day')+86400000;
let input = [];

for(var i = 0;i < 96; i++) {
  let epoch = {};
  epoch.timeStamp=nextMidNight+(900000*i);
  epoch["1.8.0"] = 1000;
  input.push(epoch);
}
let decorator = new gsi2obis({zip:'69115', qualifier_forecast:'187'});

decorator.parseMscons(input).then(function(output) { console.log(output); }).catch(function(e) { console.log(e); });
decorator.
