require('dotenv').config();

const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const { ethers } = require("ethers");

const port = process.env.PORT || 3000;

const abi = require('./ABIs/DiscreetLog.json');

const INFURA_ID = process.env.INFURA_PROJ_ID;

// TODO: provider network & contract address should be settable as cmdline arg / in config file
const NETWORK = 'kovan'
const ADDRESS = '0x365441EC0974F6AC9871c704128e9da2BEdE10CE';

const provider = new ethers.providers.JsonRpcProvider(`https://${NETWORK}.infura.io/v3/${INFURA_ID}`);
const address = ADDRESS;

const contract = new ethers.Contract(address, abi, provider);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

console.log(`Listening to events on ${address} \n`);

provider.on("block", (blockNumber) => {
  io.emit('eth event', `New block: ${blockNumber}`);
})

contract.on("RequestCreateDLC", (feedAddress, closingTime, emergencyRefundTime, caller) => {
  const currentTime = new Date();
  io.emit('eth event', `New DLC request @ ${currentTime} \n\t feedAddr: ${feedAddress} | closingTime: ${closingTime} | emergencyRefundTime: ${emergencyRefundTime} | caller: ${caller} \n`);

});
contract.on("NewDLC", (uuid, feedAddress, closingTime, emergencyRefundTime) => {
  const currentTime = new Date();
  io.emit('eth event', `New DLC created @ ${currentTime} \n\t uuid: ${uuid} | feedAddr: ${feedAddress} | closingTime: ${closingTime} | emergencyRefundTime: ${emergencyRefundTime} \n`);
});
contract.on("CloseDLC", (uuid, price, actualClosingTime) => {
  const currentTime = new Date();
  io.emit('eth event', `Closing DLC @ ${currentTime} \n\t uuid: ${uuid} | price: ${price} | actualClosingTime: ${actualClosingTime} \n`);
});
contract.on("EarlyCloseDLC", (uuid, price, actualClosingTime) => {
  const currentTime = new Date();
  io.emit('eth event', `Early closing DLC @ ${currentTime} \n\t uuid: ${uuid} | price: ${price} | actualClosingTime: ${actualClosingTime} \n`);
});

http.listen(port, () => {
  console.log(`Socket.IO server running at http://localhost:${port}/`);
});

