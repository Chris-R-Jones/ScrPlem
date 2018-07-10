


//##############################################
//   This file contains a number of 'constant' definitions wherever user
// choice is needed to guide decisions.
//
// It's further separated with different values, per account, as again,
// values tend to be different for different users.
//##############################################


//--------------------------------
// Definitions for Plemenit account

var PlemPref = {

    myUserName: 'Plemenit',

    // For selecting room to bootstrap, and primary room that drives it.
    hostRoomName: 'E4N47',
    bootRoomName: 'E7N49',
    bootEnabled:  true  ,

    // Whether to 'exodus' goods toward terminal for sale or transfer.
    storageExodus: false,

    // Whether to balance energy/minerals between terminals.
    balanceEnergy: true,
    balanceMinerals: true,
    debugTransfers: true, // 'verbose', // true/false
    prioritizedRoomName: null, //'E4N47', // 'W2N31', //'E4N43', //'E3N42',

    // Are we in preparing for war? If so we'll load labs with boosts rather
    // than production.
    warPrep: false,
    loadList: [ 'XLHO2'   // HEAL boost
              , 'XZHO2'   // MOVE boost
              , 'XGHO2'   // TOUGH boost
              , 'XUH2O'   // ATTACK boost
              , 'XZH2O'   // WORK dismantle boost
              //, 'XGH2O'   // WORK upgrade controller boost
              ],

    // Don't produce goods we don't intend to use.
    prodExcludeList: [ 'GH', 'GH2O', 'XGH2O'  // upgrade effectiveness
                     , 'UO', 'UHO2', 'XUHO2'  // harvest effectiveness
                     , 'KH', 'KH2O', 'XKH2O'  // carry effectiveness
                     , 'LH', 'LH2O', 'XLH2O'  // work repair and build effectiveness
                     ],

    // Minimum balance at which we'll purchase goods from the market.
    purchaseMinCredits: 10000000,
    buyList: [ 'H', 'O', 'X', 'K','Z','L','U' ],

    // Global flag, whether we should be looking for goods to sell.
    enableSales: true,
    npcOnly: false,

    // Debug flags.  Set to true/false for all, or a room name for selective debug
    debugSpawns: false,

    // Test creep visit rooms
    testR1: 'W2N42',
    testR2: 'W2N42',
    testR3: 'W2N42',
    testR4: 'W2N42', //W2N42

    // Sign/banner we'll use to sign controllers in each room.
    signText: "[Ypsilon Pact] Computers help us make mistakes faster than anything short of handguns and tequila.",
    areaSignText: "[Ypsilon Pact] Reserved for YP",

    // Generalissimo attack orders.
    //debugMilitary: 'E9N48',       // false, 'verbose', or roomName
    attackOrders: { 'W14N21': false, 'W14N20':false, 'W16N20':false ,'W15N20':false, 'E9N48':false, 'E9N49':false, 'E8N48':false, 'E9N47':false, 'E8N49':false, 'E7N49': false, 'E7N48': false },
    attackFromRooms: [ 'W13N25','W12N26','W8N22', 'W9N19','W11N22', 'W11N23' ], // [ 'W8N22', 'W6N22' ],
    attackBoosted: false,
    boostAttackRooms: { 'E1N24': false },
};


// Preferences for warthog on private test server

var WartPref = {

    myUserName: 'Warthog',

    // For selecting room to bootstrap, and primary room that drives it.
    hostRoomName: 'W3N4',
    bootRoomName: 'W3N1',
    bootEnabled:  true,

    // Whether to 'exodus' goods toward terminal for sale or transfer.
    storageExodus: false,

    // Whether to balance energy/minerals between terminals.
    balanceEnergy: true,
    balanceMinerals: true,
    debugTransfers: false, // 'verbose' or true
    prioritizedRoomName: 'W3N1',

    // Are we in preparing for war? If so we'll load labs with boosts rather
    // than production.
    warPrep: false,
    loadList: [ 'XLHO2'   // HEAL boost
              , 'XZHO2'   // MOVE boost
              , 'XGHO2'   // TOUGH boost
              , 'XUH2O'   // ATTACK boost
              , 'XZH2O'   // WORK dismantle boost
              //, 'XGH2O'   // WORK upgrade controller boost
              ],

    // Don't produce goods we don't intend to use.
    prodExcludeList: [ 'GH', 'GH2O', 'XGH2O'  // upgrade effectiveness
                     , 'UO', 'UHO2', 'XUHO2'  // harvest effectiveness
                     , 'KH', 'KH2O', 'XKH2O'  // carry effectiveness
                     , 'LH', 'LH2O', 'XLH2O'  // work repair and build effectiveness
                     ],

    // Minimum balance at which we'll purchase goods from the market.
    purchaseMinCredits: 1500000,
    //buyList: [ 'H', 'O', 'X', 'K','Z','L','U' ],
    buyList: [ 'X' ],

    // Global flag, whether we should be looking for goods to sell.
    enableSales: true,
    npcOnly: true,

    // Debug flags.  Set to true/false for all, or a room name for selective debug
    debugSpawns: false,

    // Test creep visit rooms
    testR1: 'E7S12',
    testR2: 'E10S1',
    testR3: 'E9S2',
    testR4: 'E9S1',

    // Sign/banner we'll use to sign controllers in each room.
    signText: "Test server Warthog",
    areaSignText: "Claimed by Wart.",

    // Generalissimo attack orders.
    debugMilitary: true,       // false, 'verbose', or roomName
    attackOrders: { 'W1N1': false  },
    attackFromRooms: [ 'W5N3', 'W3N4' ],
    attackBoosted: false,
};

var selected;

var Preference = {

    get: function()
    {
        let username;

        if(selected)
            return selected;

        if(Memory.username)
            username = Memory.username;
        else {
            // Figure out caller's username.  No great direct way to do this..
            let spawns = Game.spawns;
            let spawnName;
            for (spawnName in Game.spawns)
                break;
            if(!spawnName) {
                console.log('No memory and no spawns, cant determine user');
                return (selected=PlemPref);
                return null;
            }

            if(!spawnName){
                console.log('Spawns='+spawns+' spawnName='+spawnName);
                console.log('keys='+JSON.stringify(Object.keys(Game.spawns)));
                return null;
            }

            let spawn = Game.spawns[spawnName];
            Memory.username = username = spawn.owner.username;
            console.log('Selected username = '+username+' mem='+Memory.username);
        }

        if( username == 'Plemenit' )
            return (selected=PlemPref);
        else if (username == 'Warthog')
            return (selected=WartPref);
        else {
            console.log('Unrecognized username '+username+' in Preference.js');
            return null;
        }
    }
};

module.exports = Preference.get();
