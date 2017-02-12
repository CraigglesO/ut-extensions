import * as test from "blue-tape";
import { UTmetadata, UTpex } from "../ut-extensions";
import { Buffer } from "buffer";

const bencode        = require("bencode"),
      string2compact = require("string2compact"),
      compact2string = require("compact2string"),
      parseTorrent   = require("parse-torrent"),
      fs             = require("fs");


const magnetLink = "magnet:?xt=urn:btih:74416fe776ca02ca2da20f686fed835e4dcfe84d&dn=Screen+Shot+2017-01-21+at+8.25.15+AM.png&tr=udp%3A%2F%2F0.0.0.0%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com";
// Prepare tests
const torrent      = fs.readFileSync("./screen.torrent");
const torrentFile  = parseTorrent(torrent);

const torrent2     = fs.readFileSync("./ntbos.torrent");
const torrentFile2 = parseTorrent(torrent2);


// PREP
const name        = torrentFile.name;
const nameBuf     = Buffer.from(name);
const info        = torrentFile.info;
const infoBuf     = bencode.encode(torrentFile.info);
const infoBufFail = torrent;
const infoLength  = infoBuf.length;
const infoBuf2    = bencode.encode(torrentFile2.info);
const infoLength2 = infoBuf2.length;

// Initial message:
// const message = {
//   m: {
//     ut_metadata: 1,
//     ut_pex: 2
//   },
//   metadata_size: 13143 //infoLength
// };


// Prep responce messages
const message    = { "msg_type": 1, "piece": 0 };
const messageBen = bencode.encode(message);

const completeMessage     = Buffer.concat([messageBen, infoBuf]);
const completeMessageFail = Buffer.concat([messageBen, infoBufFail]);

// Prep request message
const messageR         = { "msg_type": 0, "piece": 0 };
const messageRben      = bencode.encode(messageR);
const completeMessageR = Buffer.concat([messageRben]);

const messageR2         = { "msg_type": 0, "piece": 1 };
const messageRben2      = bencode.encode(messageR2);
const completeMessageR2 = Buffer.concat([messageRben2]);


let str          = null,
    trailerIndex = null,
    dict         = null,
    trailer      = null;

// ut_metadata tests:

test("ut_metadata receive", (t) => {
  t.plan(17);

  let ut_metadata = new UTmetadata(infoLength, torrentFile.infoHash);

  ut_metadata.on("metadata", (tor) => {
    let tip = tor.info.pieces.toString();
    t.equal(tor.info.name.toString(), torrentFile.info.name.toString(), "Check that the metadata is downloaded and parsed appropriately - info name");
    t.equal(tor.info["piece length"], torrentFile.info["piece length"], "Check that the metadata is downloaded and parsed appropriately - info piece length");
    t.equal(tip, torrentFile.info.pieces.toString(), "Check that the metadata is downloaded and parsed appropriately - info pieces");
    t.equal(tor.name, torrentFile.name, "Check that the metadata is downloaded and parsed appropriately - name");
    t.equal(tor.files.length, torrentFile.files.length, "Check that the metadata is downloaded and parsed appropriately - file Length");
    t.equal(tor.files.path, torrentFile.files.path, "Check that the metadata is downloaded and parsed appropriately - file path");
    t.equal(tor.files.name, torrentFile.files.name, "Check that the metadata is downloaded and parsed appropriately - file name");
    t.equal(tor.files.offset, torrentFile.files.offset, "Check that the metadata is downloaded and parsed appropriately - file offset");
    t.equal(tor.length, torrentFile.length, "Check that the metadata is downloaded and parsed appropriately - length");
    t.equal(tor.pieceLength, torrentFile.pieceLength, "Check that the metadata is downloaded and parsed appropriately - pieceLength");
    t.equal(tor.lastPieceLength, torrentFile.lastPieceLength, "Check that the metadata is downloaded and parsed appropriately - lastPieceLength");
    t.equal(JSON.stringify(tor.pieces), JSON.stringify(torrentFile.pieces), "Check that the metadata is downloaded and parsed appropriately - pieces");
  });

  // Check object is ready to go...
  t.equal(ut_metadata.infoHash, torrentFile.infoHash, "checking proper variable storage");
  t.equal(ut_metadata.metaDataSize, infoLength, "checking proper variable storage");

  // Check the piece count:
  t.equal(ut_metadata.piece_count, 1, "Piece count size");

  // Check array is built:
  t.true(Array.isArray(ut_metadata.pieces), "Piece array created");
  // Check the array is equal to the piece count:
  t.equal(ut_metadata.pieces.length, ut_metadata.piece_count, "Piece array count size");

  // Send a message, see if we get a responce:
  ut_metadata._message(completeMessage);

  t.end();

});

test("ut_metadata request WITHOUT torrent info", (t) => {
  t.plan(1);

  let ut_metadata = new UTmetadata(infoLength, torrentFile.infoHash);

  ut_metadata.on("meta_r", (msg) => {
    t.equal( JSON.stringify( bencode.decode(msg) ), "{\"msg_type\":2,\"piece\":0}", "meta_r without torrent info");
  });

  ut_metadata._message(completeMessageR);

  t.end();
});

test("ut_metadata request WITH torrent info", (t) => {
  t.plan(3);

  let ut_metadata = new UTmetadata(infoLength, torrentFile.infoHash, torrentFile.info);

  ut_metadata.on("meta_r", (payload) => {
    str          = payload.toString();
    trailerIndex = str.indexOf("ee") + 2;
    dict         = bencode.decode( str );
    trailer      = payload.slice(trailerIndex);

    let inf   = bencode.encode(torrentFile.info);
    let rslt = [];
    for (let j = 0; j < inf.length; j += (16383 + 1)) {
      rslt.push(inf.slice(j, j + (16383 + 1)));
    }
    t.equal( JSON.stringify(dict), "{\"msg_type\":1,\"piece\":0}", "meta_r with torrent info - DICT");
    t.equal( trailer.toString(), rslt[0].toString(), "meta_r with torrent info - TRAILER");
  });

  t.equal(ut_metadata.torrentInfo.length, 1, "properly resize the torrentInfo array");

  ut_metadata._message(completeMessageR);

  t.end();
});

test("ut_metadata request WITH LARGE torrent info", (t) => {
  t.plan(5);

  let ut_metadata = new UTmetadata(infoLength2, torrentFile2.infoHash, torrentFile2.info);
  ut_metadata.on("meta_r", (payload) => {
    str          = payload.toString();
    trailerIndex = str.indexOf("ee") + 2;
    dict         = bencode.decode( str );
    trailer      = payload.slice(trailerIndex);

    let info   = bencode.encode(torrentFile2.info);
    let result = [];
    for (let i = 0; i < info.length; i += 16384) {
      result.push(info.slice(i, i + 16384));
    }
    t.equal( JSON.stringify(dict), `{\"msg_type\":1,\"piece\":${dict.piece}}`, "meta_r with large torrent info - DICT");
    t.equal( trailer.toString(), result[dict.piece].toString(), "meta_r with large torrent info - TRAILER");
  });

  t.equal(ut_metadata.torrentInfo.length, 2, "properly resize the torrentInfo array");

  ut_metadata._message(completeMessageR);
  ut_metadata._message(completeMessageR2);

  t.end();
});

test("ut_metadata properly handle failure", (t) => {
  t.plan(1);

  let ut_metadata = new UTmetadata(infoLength, torrentFile.infoHash);

  ut_metadata.on("next", (index) => {
    t.equal(index, 0, "Bad data, so it should try again sending a 0");
  });

  ut_metadata._message(completeMessageFail);

  t.end();
});

// UT_PEX TESTS

test("UT_PEX tests", (t) => {
  t.plan(4);

  let ut_pex = new UTpex();

  ut_pex.myID("76.256.2.70:1337");

  ut_pex.on("pex_added", (peers) => {
    t.true( true, "testing pex_added responce");
    t.equal(JSON.stringify(peers), JSON.stringify([ "65.156.3.75:2000", "100.56.58.99:28525", "10.10.10.5:128" ]), "testing Canonical Peer Priority");
  });

  ut_pex.on("pex_dropped", (peers) => {
    t.true( true, "testing pex_dropped responce");
  });

  let peers = [
    "10.10.10.5:128",
    "100.56.58.99:28525",
    "65.156.3.75:2000"
  ];

  let obj = {
    "added": string2compact(peers),
    "added.f": null,
    "added6": null,
    "added6.f": null,
    "dropped": null,
    "dropped6": null
  };

  ut_pex.addPeer(["10.10.10.5:128"]);
  ut_pex.addPeer(["10.10.10.5:128"]);     // duplicate to test sureity of uniqueness
  ut_pex.addPeer(["100.56.58.99:28525"]);
  ut_pex.addPeer(["65.156.3.75:2000"]);


  let ben = bencode.encode(obj);

  ut_pex._message(ben);

  let msg = ut_pex.prepMessage();

  let ben_msg = bencode.decode(msg);

  t.equal(ben_msg["added.f"].toString("hex"), (new Buffer([0x02, 0x02, 0x02])).toString("hex"), "Correct added.f");

  t.equal(ben_msg["added"].toString("hex"), string2compact(peers).toString("hex"), "Correct added");


  t.end();
});
