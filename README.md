# ut-extensions [![travis][travis-image]][travis-url] [![npm][npm-image]][npm-url]  [![downloads][downloads-image]][downloads-url]

[travis-image]: https://travis-ci.org/CraigglesO/ut-extensions.svg?branch=master
[travis-url]: https://travis-ci.org/CraigglesO/ut-extensions
[npm-image]: https://img.shields.io/npm/v/ut-extensions.svg
[npm-url]: https://npmjs.org/package/ut-extensions
[downloads-image]: https://img.shields.io/npm/dm/ut-extensions.svg
[downloads-url]: https://npmjs.org/package/ut-extensions

### Extensions for The Bittorent Protocol

* PEX (PEer eXchange) Protocol          [BEP_0011]
* Extension Protocol                    [BEP_0010]
* DHT (Distrubuted Hash Table) Protocol [BEP_0005]
* Canonical Peer Priority               [BEP_0040]


## Install

``` javascript
npm install ut-extensions
```

## Usage

**UTmetadata**

``` javascript
new UTmetadata(metaDataSize: number, infoHash: string);
```

* metaDataSize - total size of the torrent data
* infoHash     - info_hash of the torrent to be downloaded

``` javascript
import { UTmetadata } from "ut-extensions";

// create a metadata instance
const metadata = new UTmetadata(18716, "294150cb4beb7585d89d5faf447121fee5360d82");

// Incoming metadata Buffer goes here
metadata._message("insert_Buffer_message_here");

metadata.on("metadata", (metadata) => {
  // metadata is a completed torrent file
});

metadata.on("next", (index) => {
  // index specifies which metadata piece to request next
});

metadata.on("meta_r", (payload) => {
  // Buffer message to send back with the dictionary response and trailer
});

// Prepare metadata handshake buffer for incoming peers
let buf = metadata.prepHandshake();

```

**UTpex**

``` javascript
new UTpex();
```

* no inputs

``` javascript
import { UTpex } from "ut-extensions";

// Create a pex instance
const pex = new UTpex();

// Incoming pex Buffer goes here
pex._message("insert_Buffer_message_here");

pex.on("pex_added", (peers) => {
  // new added ip_v4 peers
});
pex.on("pex_added6", (peers) => {
  // new added ip_v6 peers
});

pex.on("pex_dropped", (peers) => {
  // dropped ip_v4 peers
});
pex.on("pex_dropped6", (peers) => {
  // dropped ip_v6 peers
});

// Add "add" peers to the list
pex.addPeer (peers: Array<string>);
pex.addPeer6 (peers: Array<string>);

// Add "drop" peers to the list
pex.dropPeer (peers: Array<string>);
pex.dropPeer6 (peers: Array<string>);

// Prepare a message to send out
let msg = prepMessage();

// Add all options
pex.addAll(addPeers: Array<string>, addPeers6: Array<string>, dropPeers: Array<string>, dropPeers6: Array<string>);

```

## ISC License (Open Source Initiative)

ISC License (ISC)
Copyright 2017 <CraigglesO>
Copyright (c) 2004-2010 by Internet Systems Consortium, Inc. ("ISC")
Copyright (c) 1995-2003 by Internet Software Consortium


Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
