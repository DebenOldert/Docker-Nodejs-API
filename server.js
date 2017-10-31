'use strict';

/*
	
	Created by Deben Oldert
	
*/

const express = require('express');
const parser = require('body-parser');
const needle = require('needle');

//ENVIRONMENT VARIABLES
/*
	CC => ip:port of the CC server
	PORT => Port to listen on
	IP => The ip address to listen on
	GUID => Unique ID of this host
*/

// Constants
const PORT = process.env.PORT || 8080;
const CC = process.env.CC || "172.17.0.2:8092";
const IP = process.env.IP || "172.17.0.3";
const GUID = process.env.GUID || "00000000-0000-0000-0000-000000000000";

//CLASSES

class DOCUMENT {
	
	constructor(id, title, author, date, text){
		this.id = id;
		this.title = title;
		this.author = author;
		this.date = date;
		this.text = text;
	}
}

//VARS
var docs = [];
var peer = [CC]; //Have to add yourself here BUG in ccserver

//FUNCTIONS

//Check how many times a string occurs in another string
String.prototype.occurs = function(str){
	if(this.length <= 0) return 0;
	//Make sure it's a string
	str += "";
	
	var i = 0;
	var pos = 0;
	
	while(true){
		//Get the position of the occurrence
		pos = str.indexOf(this, pos);
		
		//Found it
		if(pos >= 0){
			++i;
			//Update start search position
			pos+= this.length;
		}
		//Found nothing? Stop the search
		else break;
	}
	//Return the number of found occurrences
	return i;
}
//Function to announce ourselfs to the CC
function announce(){
	//Create a post request
	needle.post(
		"http://"+CC+"/v2.0/aanmelden/",
		{
			cc: CC,
			hostid: GUID,
			peernodes: peer
		},
		{
			json: true,
		},
		function(err, resp){
			//Got an error?
			if(err || resp.statusCode != 200){
				console.warn("Error: Couldn't announce to "+CC+". Status:"+resp.statusCode);
				return;
			}
			//No error, all good
			console.log("Succesfully announced");
			
			if("peernodes" in resp.body){
				for(var i=0; i<resp.body.peernodes.length; i++){
					peer.push(resp.body.peernodes[i]);
				}
				console.log("Retrieved " + peer.length + " peer nodes");
			}
		}
	)
}

// App
const app = express();

app.use(parser.json());

app.post('/v2.0/pushdocument', (req, res) => {
	//Required variables
	var required = ["docid", "titel", "auteur", "datum", "tekst"];
	
	//Check if we have all the required variables
	for(var i=0; i<required.length; i++){
		//Variable not found? Stop the request
		if(!(required[i] in req.body)){
			console.warn("PushDocument requierd variable missing: " + required[i]);
			resp.status(500).send();
			return;
		}
	}
	//All good, create new document class
	docs.push(new DOCUMENT(req.body.docid, req.body.titel, req.body.auteur, req.body.datum, req.body.tekst));
	
	console.log("Succesfully added document: " + req.body.docid);
	
	//Tell the ccserver we good
	res.status(200).send();
});

app.post('/v2.0/reset', (req, res) => {
	console.log("Reset command recieved");
	//Speeks for itself
	for(var i=0; i<peer.length; i++){
		console.log("Telling peer " + peer[i] + " to reset");
		//Send peer a post request
		needle.post("http://"+peer[i]+"/v2.0/reset", {});
	}
	peer = [CC];
	//Starting 5s cooldown before we announce ourself again to the ccserver
	console.log("Starting cooldown before re-announcing");
	setTimeout(announce, 5000);
	res.status(200).send();
});

app.post('/v2.0/selecteer', (req, res) => {
	var out = [];
	//Is the filter variable set?
	if("filter" in req.body) {
		var filter = req.body.filter;
		
		console.log("Filtering for: " + filter.join(", "));
		
		//Check each document
		for(var i=0; i<docs.length; i++){
			var cnt = 0;
			//Check each line in the document
			for(var j=0; j<docs[i].text.length; j++){
				//Check each filter for each line in the document
				for(var k=0; k<filter.length; k++){
					//Increase the score with the amount of occurrences found
					cnt += filter[k].occurs(docs[i].text[j]);
				}
			}
			//Did it occur at least once? Add it to the output array
			if(cnt > 0) out.push({docid: docs[i].id, score: cnt});
		}
		
		//Function to compare each document in the output array
		function compare(a, b){
			if(a.score > b.score) return -1;
			if(a.score < b.score) return 1;
			return 0;
		}
		//Now actually sort the array
		out.sort(compare);
		
		console.log("Found " + out.length + " documents");
		
		res.send(out);
	}
	else { //Oops filter variable not set
		console.warn("Select filter variable missing");
		res.status(500).send();
	}	
	
});

//Announce
console.log("Announcing node to cc on: " + CC);
announce();

//Start listening
console.log("Starting listener service on: " + IP + ":" + PORT);
console.log("GUID: " + GUID);
app.listen(PORT);