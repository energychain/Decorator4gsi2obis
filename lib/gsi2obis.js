const moment = require("moment");
const http_request = require("request");

module.exports = gsi2obis;

/**
 * [EN] Decorator to split/convert GSI values to OBIS Codes
 * [DE] Aufteilung eines Array von Messwerten in die zugehörigen OBIS Kennzahlen und ihre Positionen
 *
 * @constructor
 * @param {Array} input - Input Stream of Metered readings to decorate
 * @param {Object} options - Properties to use for decoration
 */

function gsi2obis(options) {
  if(typeof options == "undefined") options={};
  if(options == null) options = {};
  if(typeof options.zip == 'undefined') options.zip = '69256';
  if(typeof options.timezoneOffset == 'undefined') options.timezoneOffset = '+01';
  this.options=options;
  let parent = this;

  this.decorate=function(input) {
    return new Promise(function (resolve, reject)  {
      let output=[];
      http_request("https://api.corrently.io/core/gsi?plz="+parent.options.zip,function(e,r,b) {
        b=JSON.parse(b);
        for(var i = 0; i< b.forecast.length;i++) {
          b.forecast[i].gsi = 0.01*b.forecast[i].gsi;
        }
        let previous_gsi =  b.forecast[0];
        let next_gsi = b.forecast[0];
        let gsi_index = 0;
        let now = new Date().getTime();

        for(var i=0;i<input.length;i++) {
            let input_epoch = input[i];
            if(input_epoch.timeStamp >= b.forecast[0].timeStamp) { // only process if oldest timeStamp from gsi fits
              if(input_epoch.timeStamp >= previous_gsi.timeStamp) {
                while((input_epoch.timeStamp >= next_gsi.timeStamp)&&(gsi_index < b.forecast.length)) {
                  gsi_index++;
                  if(gsi_index < b.forecast.length) {
                    previous_gsi = next_gsi;
                    next_gsi = b.forecast[gsi_index];
                  }
                }
                if(gsi_index < b.forecast.length) {
                    input[i].interpolation =  (input_epoch.timeStamp-previous_gsi.timeStamp)/(next_gsi.timeStamp  - previous_gsi.timeStamp);
                    input[i].gsi = (next_gsi.gsi * input[i].interpolation) + (previous_gsi.gsi * (1-input[i].interpolation));
                    if(typeof input[i]["1.8.0"] != "undefined") {
                      input[i]["1.8.1"] = input[i]["1.8.0"] * input[i].gsi;
                      input[i]["1.8.2"] = input[i]["1.8.0"] * (1-input[i].gsi);
                      input[i]["obis"]= {
                            "1.8.0": input[i]["1.8.0"],
                            "1.8.1": input[i]["1.8.1"],
                            "1.8.2": input[i]["1.8.2"]
                      }
                    }
                    if(typeof input[i]["energy"] != "undefined") {
                      input[i]["green"] = input[i]["energy"] * input[i].gsi;
                      input[i]["grey"] = input[i]["energy"] * (1-input[i].gsi);
                      input[i]["shares"]= {
                        "total": input[i]["energy"],
                        "green": input[i]["green"],
                        "grey": input[i]["grey"]
                      }
                    }
                    let qualifier='201';
                    if(typeof parent.options.qualifier_actual != "undefined") qualifier = parent.options.qualifier_actual;
                    if(input[i].timeStamp>now) {
                        qualifier='187';
                        if(typeof parent.options.qualifier_forecast != "undefined") qualifier = parent.options.qualifier_forecast;
                    }
                    input[i].qualifier=qualifier;
                    output.push(input[i]);
                }
              }
            }
        }
        resolve(output);
      });
    });
  }

  this._msconsBeginFormatter = function(timeStamp) {
    return "DTM+163:"+moment(timeStamp).format("YYYYMMDDHHmm")+"?"+parent.options.timezoneOffset+":303'";
  }

  this._msconsEndFormatter = function(timeStamp) {
    return "DTM+164:"+moment(timeStamp).format("YYYYMMDDHHmm")+"?"+parent.options.timezoneOffset+":303'";
  }
  this._mcons15MinuteIdentifier = function() {
    return "DTM+672:15:806'";
  }
  this.parseMscons = function(input) {
    return new Promise(function (resolve, reject)  {
      http_request.post('https://api.corrently.io/gsi/mscons',{mscons:input},function(e,r,b) {
        b = JSON.parse(b);
        if((typeof b.err != "undefined") && (b.err != null)) {
            reject(b.err);
        } else {
          resolve(b.data);
        }
      })
    });
  }
  this.mscons = function(input) {
    return new Promise(function (resolve, reject)  {
      parent.decorate(input).then(function(output_decoration) {
        let output=[];
        output.push(parent._msconsBeginFormatter(input[0].timeStamp));
        output.push(parent._mcons15MinuteIdentifier());

        output.push("LIN+1'");
        output.push("PIA+5+1-1?:1.8.0:SRW'");
        for(var i=0;i<output_decoration.length;i++) {
          output.push("QTY+"+output_decoration[i].qualifier+":"+output_decoration[i].obis["1.8.0"]+"'");
        }
        output.push("LIN+2'");
        output.push("PIA+5+1-1?:1.8.1:SRW'");
        for(var i=0;i<output_decoration.length;i++) {
          output.push("QTY+"+output_decoration[i].qualifier+":"+output_decoration[i].obis["1.8.1"]+"'");
        }
        output.push("LIN+3'");
        output.push("PIA+5+1-1?:1.8.2:SRW'");
        for(var i=0;i<output_decoration.length;i++) {
          output.push("QTY+"+output_decoration[i].qualifier+":"+output_decoration[i].obis["1.8.2"]+"'");
        }

        resolve(output);
      })
    });
  }
}
