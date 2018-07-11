//var Role                = require('Role');

var Preference          = require('Preference');

var Generalissimo       = require('Generalissimo');
var Grafana             = require('Grafana');

var Mil_Decon           = require('Mil_Decon');
var Mil_Healer          = require('Mil_Healer');
var Mil_Looter          = require('Mil_Looter');
var Mil_Omni            = require('Mil_Omni');

var RoomHolder          = require('RoomHolder');
var RoomPlanner         = require('RoomPlanner');

var RoomCoord           = require('RoomCoord');

var Role_BootMover      = require('Role_BootMover');
var Role_Chemist        = require('Role_Chemist');
var Role_ClaimController = require('Role_ClaimController');
var Role_CtrlMover      = require('Role_CtrlMover');
var Role_CtrlUpgrade    = require('Role_CtrlUpgrade');
var Role_DediHarv       = require('Role_DediHarv');
var Role_Distributor    = require('Role_Distributor');
var Role_FRBootstrap    = require('Role_FRBootstrap');
var Role_NewRoomProbe   = require('Role_NewRoomProbe');
var Role_Linker         = require('Role_Linker');
var Role_Mason          = require('Role_Mason');
var Role_Miner          = require('Role_Miner');
var Role_Minecart       = require('Role_Minecart');
var Role_MiniAttack     = require('Role_MiniAttack');
var Role_OptMover       = require('Role_OptMover');
var Role_Probe          = require('Role_Probe');
var Role_RemoteBootstrap= require('Role_RemoteBootstrap');
var Role_Repair         = require('Role_Repair');
var Role_Reserve        = require('Role_Reserve');
var Role_SectorProbe    = require('Role_SectorProbe');
var Role_SK_Clear       = require('Role_SK_Clear');
var Role_Test           = require('Role_Test');
var Role_TowerFill      = require('Role_TowerFill');

var Role_TstHeal        = require('Role_TstHeal');
var Role_TstDecon        = require('Role_TstDecon');
var Role_TstGrunt       = require('Role_TstGrunt');
var TowerController     = require('TowerController');


// Some globals calculated each turn
var g_nRooms         = 0;
var g_avgRoomMinWall = 0;

//-------------------------------------------------------------
// Room construction and analysis methods
//----------------------------------------------------------------------


// Room constructor.
// In the constructor we can store any anlysis that will not change, but
// be careful as these results aren't permanent -- anything that may
// change at all should be stored by refresh.
function RoomObj ( room, rmem ) {
    this.m_spawns       = [];
    this.m_extensions   = [];
    this.m_containers   = [];
    this.m_towers       = [];
    this.m_rampartsWalls = [];
    this.m_labs          = [];
    this.m_lairs         = [];

    if(this.m_allStruct)
        delete this.m_allStruct;
    if(this.m_sources)
        delete this.m_sources;
    if(this.m_sites)
        delete this.m_sites;
    if(this.m_hostiles)
        delete this.m_hostiles;
    if(this.m_friendlies)
        delete this.m_friendlies;
    if(this.m_wounded)
        delete this.m_wounded;
    if(this.m_dropped)
        delete this.m_dropped;
    if(this.m_tombs)
        delete this.m_tombs;

    if(this.m_harvestPositions)
        delete this.m_harvestPositions;
    if(this.m_dediHarvPositions)
        delete this.m_dediHarvPositions;
    if(this.m_labGroup)
        delete this.m_labGroup;

    if(this.m_defenceMatrix)
        delete this.m_defenceMatrix;

    // If rmem is null, this is a brand spanking new room.  Give it a
    // memory (initially we don't have to have any variables 'always' but
    // do store into it so we do need the object).
    if(!rmem)
        rmem = Memory.rooms[room.name] = {};
    this.refreshObj(room, rmem);
}


// "static" function invoked each tick to rebuild/re-analyze all room objects.
RoomObj.newTick = function() {
    RoomHolder.clear();

    g_avgRoomMinWall = 0;
    g_nRooms = 0;

    if(!Memory.rooms)
        Memory.rooms = {}

    for(let rName in Memory.rooms){
        let rmem = Memory.rooms[rName];
        let room = Game.rooms[rName];
        let roomObj = RoomHolder.get(rName);
        if(roomObj){
            roomObj.refreshObj(room,rmem);
        }
        else{
            roomObj = new RoomObj(room,rmem);
            RoomHolder.set(rName, roomObj);
        }
    }

    // Search for rooms that are brand spanking new and didn't have
    // memory (rare).
    for ( let rName in Game.rooms ){
        if(Memory.rooms[rName])
            continue;
        console.log('NEW ROOM VISITED '+rName);

        let room    = Game.rooms[rName];
        let rObj    = new RoomObj(room,null);
        RoomHolder.set(rName, rObj);
    }

    if(g_nRooms){
        g_avgRoomMinWall /= g_nRooms;
    }
}


// Object refresher
// Main function invoked once per tick to analyze an active room game
// object from Game.rooms, and its memory from Memory.creeps, storing analysis.
RoomObj.prototype.refreshObj = function(room, rmem){
    this.m_room = room;
    this.m_rmem = rmem;

    // Clear earlier game object references.
    this.m_sources = null;
    this.m_allStruct = null;
    this.m_hostiles = null;
    this.m_friendlies = null;
    this.m_sites = null;
    this.m_spawnStorage = null;
    this.m_topLeftSpawn = null;
    this.m_controllerContainer = null;
    this.m_extractor = null;
    this.m_mineral = null;
    this.m_terminal = null;
    this.m_nuker = null;
    this.m_observer = null;

    this.m_spawns.length = 0;
    this.m_extensions.length = 0;
    this.m_towers.length = 0;
    this.m_labs.length = 0;
    this.m_containers.length = 0;
    this.m_rampartsWalls.length = 0;
    this.m_lairs.length = 0;

    if(this.m_harvestPositions)
        delete this.m_harvestPositions;
    if(this.m_dediHarvPositions)
        delete this.m_dediHarvPositions;

    // Past this point, this is live room analysis, and needs a room
    // object.
    if(this.m_room == null)
        return;

    // Analyze controller & save summary in memory.
    let controller = room.controller;

    if(!controller)
        rmem.owner = 'none';
    else if(!controller.owner){
        if(controller.reservation && controller.reservation.ticksToEnd > 0){
            if(controller.reservation.username == Preference.myUserName)
                rmem.owner = 'me';
            else
                rmem.owner = 'reserved';
        }
        else
            rmem.owner = 'nouser';
    }
    else if(controller.my)
        rmem.owner = 'me';
    else
        rmem.owner = controller.owner.username;

    if(controller && controller.safeMode)
        rmem.safeMode = controller.safeMode;
    else
        delete rmem.safeMode;


    let incomingNukes = this.m_allNukes = room.find(FIND_NUKES);
    if(incomingNukes && incomingNukes.length){
        console.log(incomingNukes.length + 'INCOMING NUKE(S) TO '+room.name+'!!!!!!!! Room owner = '+rmem.owner);
    }

    // Analyze structures.  If we're in a room, we pretty much need to
    // know about the structures, so we always analyze these each turn
    // and sort by type.
    let allStruct = this.m_allStruct = room.find(FIND_STRUCTURES);

    // Sort them into arrays by type.  Make sure we first clear any
    // old values out of earlier arrays (setting length avoids some
    // garbage collection)

    // While scanning, also calculate repair levels and find the brokenedest.
    let minRepair = 1;
    let minStruct;
    let avgRepairSum=0;
    let avgRepairCount=0;
    let weighAvgRepairSumHits=0;
    let weighAvgRepairSumHitsMax=0;
    let roadCount=0;

    this.m_minRampartsWallsHits=Infinity;

    let defenceMax;
    if(controller && controller.my)
        this.m_defenceMax = defenceMax = Generalissimo.getDefenceMax(controller);

    for(let si=0; si<allStruct.length; si++) {
        let struct = allStruct[si];
        let hitsMax;

        if(struct.structureType == STRUCTURE_WALL || struct.structureType == STRUCTURE_RAMPART)
            hitsMax = defenceMax;
        else
            hitsMax = struct.hitsMax;

        if(struct.structureType == STRUCTURE_CONTROLLER)
            continue;

        // Walls and Ramparts we track differently than the rest, since they have
        // different repair roles.
        if(struct.structureType == STRUCTURE_WALL
            || struct.structureType == STRUCTURE_RAMPART){

            if(struct.hits < this.m_minRampartsWallsHits){
                this.m_minRampartsWallsHits = struct.hits;
                this.m_minRampartWallStruct = struct;
            }

            if(struct.hits < 500 && struct.structureType == STRUCTURE_RAMPART){
                minRepair = .0001;
                minStruct = struct;
            }
        }
        else {
            // Don't consider walls in the normal repair stats.
            let repairPct = (struct.hits / hitsMax);
            if( repairPct < minRepair){
                minRepair = repairPct;
                minStruct = struct;
            }

            if( struct.hits != struct.hitsMax ) {
                avgRepairSum += repairPct;
                avgRepairCount ++;
                weighAvgRepairSumHits += struct.hits;
                weighAvgRepairSumHitsMax += hitsMax;
            }
        }

        switch(struct.structureType){
            case STRUCTURE_ROAD:
                roadCount++;
                break;
            case STRUCTURE_SPAWN:
                this.m_spawns.push(struct);
                break;
            case STRUCTURE_EXTENSION:
                this.m_extensions.push(struct);
                break;
            case STRUCTURE_CONTAINER:
                this.m_containers.push(struct);
                break;
            case STRUCTURE_LAB:
                this.m_labs.push(struct);
                break;
            case STRUCTURE_TOWER:
                this.m_towers.push(struct);
                break;
            case STRUCTURE_TERMINAL:
                this.m_terminal = struct;
                break;
            case STRUCTURE_NUKER:
                this.m_nuker = struct;
                break;
            case STRUCTURE_OBSERVER:
                this.m_observer = struct;
                break;
            case STRUCTURE_WALL:
                this.m_rampartsWalls.push(struct);
                break;
            case STRUCTURE_RAMPART:
                this.m_rampartsWalls.push(struct);
                break;
            case STRUCTURE_EXTRACTOR:
                this.m_extractor = struct;
                break;
            case STRUCTURE_KEEPER_LAIR:
                this.m_lairs.push(struct);
                rmem.keeperRoom = true;
                break;
        }
    }

    // Log hostile activity in memory
    if( controller && !controller.my && this.m_towers.length )
        rmem.hostileTowerCt = this.m_towers.length;
    else
        delete rmem.hostileTowerCt;
    this.getHostiles();

    // Save these results for various repair activities.
    this.m_minRepairStruct  = minStruct;
    this.m_minRepairPercent = minRepair;
    if(controller && controller.my){
        rmem.defenceMax = this.m_defenceMax;
        rmem.minWallHits = this.m_minRampartsWallsHits;
        rmem.wallPercent = 100*(this.m_minRampartsWallsHits / this.m_defenceMax);

        if(rmem.minWallHits != Infinity && controller.level >= 7){
            g_avgRoomMinWall += rmem.minWallHits;
            g_nRooms ++;
        }
    }
    else {
        delete rmem.defenceMax;
        delete rmem.minWallHits;
        delete rmem.wallPercent;
    }

    if(room && room.controller && room.controller.level < 8) {
        let progress = Math.floor(room.controller.progress / room.controller.progressTotal * 1000000)/10000;
        room.visual.text(
            String.fromCodePoint(0x2699) + ' ' + progress + '% to level ' + (room.controller.level + 1),
            room.controller.pos.x + 1,
            room.controller.pos.y + 0.2,
            {align: 'left', size: 0.7}
            );
    }

    // Cleanup cost matrix if stale.
    if(rmem.costMatrix && (Game.time - rmem.costMatrixTime ) > 100){
        delete rmem.costMatrix;
    }

    // Update last visit time in memory.
    rmem.lastVisionT = Game.time;

    // Add room to processing lists if mine and holds spawns (and so terminal/spawn/tower processing)
    if(controller && controller.my){
        if(this.m_spawns.length)
            RoomHolder.addMySpawnRoom(this);
    }

    // Check sign - if the room needs to be signed, then set a flag for the sector probe
    // (We might have vision due to an observer)
    if(controller && !(controller.my)){
        // Check sign - if the room needs to be signed, then set a flag for the sector probe
        // (We might have vision due to an observer)
        if(!controller.sign
            || (controller.sign && controller.sign.username && controller.sign.username != Preference.myUserName)
           ){
            rmem.needSign = true;
            //if(controller.sign)
            //    console.log(room.name+' need sign user='+controller.sign.username+' myname='+myname);
            //else
            //    console.log(room.name+' need sign -- no sign');
        }
        else{
            delete rmem.needSign;
        }
    }

    Grafana.logRoomStats(this);


    //if(Game.time%100 == 0){
    //    if(this.m_room.controller && this.m_room.controller.my){
    //        console.log(this.m_room.name+'Lev='+this.m_room.controller.level
    //                   +' minHits='+this.m_minRampartsWallsHits+' wallPercent='+rmem.wallPercent
    //                   +' controlPct='+(this.m_room.controller.progress / this.m_room.controller.progressTotal)
    //                   +' controlLeft='+(this.m_room.controller.progressTotal-this.m_room.controller.progress)
    //                   );
    //    }
    //}

};

//----------------------------------------------------------------------
// Room helper abstractions and methods to get/set room analysis members
//----------------------------------------------------------------------


// Returns max hits we'll repair walls/ramparts to.
RoomObj.prototype.getDefenceMax = function()
{
    return this.m_defenceMax;
}

// getSpawns, returns all room spawns.
// Note it doesn't return only "my" spawns, but then generally spawns
// should either be 'all mine' or 'all enemy' (?)
RoomObj.prototype.getSpawns = function()
{
    return this.m_spawns;
};


RoomObj.prototype.findTopLeftSpawn = function()
{
    let minX;
    let maxX;
    let minY;
    let maxY;
    let tlSpawn;

    if(this.m_topLeftSpawn)
        return this.m_topLeftSpawn;

    let spawns = this.getSpawns();

    for (let si=0; si<spawns.length; si++){
        let spawn = spawns[si];
        if(!tlSpawn || spawn.pos.x < minX || spawn.pos.y < minY){
            if(spawn.pos.x - minX > 1 || spawn.pos.y - minY > 1)
                console.log(this.m_room.name+'BUG! Spawn group isnt adjacent!!');
            tlSpawn = spawn;
            minX = spawn.pos.x;
            minY = spawn.pos.y;
        }
    }
    return (this.m_topLeftSpawn = tlSpawn);
}


// getAllStructures, returns all structures in the room.
// (generally more efficient are to access the sorted lists, but there
// cases, e.g. repair, that might want the whole list)
RoomObj.prototype.getAllStructures = function()
{
    return this.m_allStruct;
}


// getExtensions
RoomObj.prototype.getExtensions = function()
{
    return this.m_extensions;
};

// getContainers
RoomObj.prototype.getContainers = function()
{
    return this.m_containers;
};

// getRampartsWalls - return array of all ramparts or walls
RoomObj.prototype.getRampartsWalls = function()
{
    return this.m_rampartsWalls;
};

RoomObj.prototype.getAvgMinWallsHits = function()
{
    return g_avgRoomMinWall;
}

// Return the room storage, or if it doesn't exist, the container nearest spawn.
RoomObj.prototype.getSpawnStorage = function()
{
    if(this.m_spawnStorage)
        return this.m_spawnStorage;

    if(this.m_room.storage)
        return (this.m_spawnStorage = this.m_room.storage);

    // This is debatably a room planner thing, but spawn container should be
    // right next to tlspawn
    let tlspawn = this.findTopLeftSpawn();
    if(!tlspawn)
        return null;

    let containers = this.getContainers();
    let ci;
    for(ci=0; ci<containers.length; ci++){
        if(   Math.abs(containers[ci].pos.x-tlspawn.pos.x)<=1
           && Math.abs(containers[ci].pos.y-tlspawn.pos.y)<=1
          ){
            return (this.m_spawnStorage = containers[ci]);
        }
    }
    return null;
}


// When looting from old owner's storage in an early room,
// it may be far from the spawn.  getSpawnStorage will return
// the far storage.  There are cases we might still want the
// spawn container.  This will return it.
RoomObj.prototype.getSpawnContainer = function()
{
    if(this.m_spawnContainer)
        return this.m_spawnContainer;

    if(!this.m_room.storage || this.m_room.storage.my)
        return this.m_spawnContainer = this.getSpawnStorage();

    let tlspawn = this.findTopLeftSpawn();
    if(!tlspawn)
        return null;

    let containers = this.getContainers();
    let ci;
    for(ci=0; ci<containers.length; ci++){
        if(   Math.abs(containers[ci].pos.x-tlspawn.pos.x)<=1
           && Math.abs(containers[ci].pos.y-tlspawn.pos.y)<=1
          ){
            return (this.m_spawnContainer = containers[ci]);
        }
    }
    return null;
}

// Return the container near controller, or null if not built yet.
RoomObj.prototype.getControllerContainer = function()
{
    if(this.m_controllerContainer)
        return this.m_controllerContainer;

    // This is debatably a room planner thing, but container should be
    // within dist 3 of controller.
    let controller = this.m_room.controller;
    let containers = this.getContainers();
    let ci;
    for(ci=0; ci<containers.length; ci++){
        if( containers[ci].pos.getRangeTo(controller) <= 3)
            return (this.m_controllerContainer = containers[ci]);
    }
    return null;
}

RoomObj.prototype.getLairs = function()
{
    return this.m_lairs;
}

RoomObj.prototype.getLabGroup = function()
{
    return this.m_labGroup;
}

RoomObj.prototype.setLabGroup = function( lg )
{
    this.m_labGroup = lg;
}

// getLabs
RoomObj.prototype.getLabs = function()
{
    return this.m_labs;
};

// getTowers
RoomObj.prototype.getTowers = function()
{
    return this.m_towers;
};

// getSources, return all sources in room.
// Does a find only on demand but saves result.
RoomObj.prototype.getSources = function()
{
    if(this.m_sources)
        return this.m_sources;
    this.m_sources = this.m_room.find(FIND_SOURCES);
    this.m_sources.sort(    function(a,b) {
                                if (a.pos.x != b.pos.x)
                                    return (b.pos.x-a.pos.x);
                                if (a.pos.y != b.pos.y)
                                    return (b.pos.y-a.pos.y);
                                return 0;
                            }
                        );
    return this.m_sources;
}

// getMineral
RoomObj.prototype.getMineral = function()
{
    if(this.m_mineral)
        return this.m_mineral;
    let minerals = this.m_room.find(FIND_MINERALS);
    if(minerals.length)
        this.m_mineral = minerals[0];
    return this.m_mineral;
}

RoomObj.prototype.getExtractor = function()
{
    return this.m_extractor;
}

RoomObj.prototype.getTerminal = function()
{
    return this.m_terminal;
}

RoomObj.prototype.getNuker = function()
{
    return this.m_nuker;
}

RoomObj.prototype.getObserver = function()
{
    return this.m_observer;
}

// getDropped, return all dropped resources in room
// Does a find only on demand but saves result.
RoomObj.prototype.getDroppedResources = function()
{
    if(this.m_dropped)
        return this.m_dropped;
    return (this.m_dropped = this.m_room.find(FIND_DROPPED_RESOURCES));
}

// getTombstones, return all tombstones in room
// Does a find only on demand but saves result.
RoomObj.prototype.getTombstones = function()
{
    if(this.m_tombs)
        return this.m_tombs;
    return (this.m_tombs = this.m_room.find(FIND_TOMBSTONES));
}

// getHostiles, return all creeps not owned by me.
// Does a find only on demand but saves result.
RoomObj.prototype.getHostiles = function()
{
    if(this.m_hostiles)
        return this.m_hostiles;
    fullHostiles = this.m_room.find
                    (FIND_CREEPS
                    ,   { filter: function (cr)
                            {
                                return (!cr.my);
                            }
                        }
                    );
    m_hostiles = [];

    // Rebuild list omitting whitelist members
    for(let hi=0; hi<fullHostiles.length; hi++){
        let hCreep = fullHostiles[hi];
        if(hCreep.owner.username == 'Zpike'
           || hCreep.owner.username == 'xsinx'
           || hCreep.owner.username == 'TuN9aN0'
           || hCreep.owner.username == 'JohnShadow'
           || hCreep.owner.username == 'Geir1983'
           //|| hCreep.owner.username == 'Totalschaden'
           || ( hCreep.owner.username == 'SteveTrov' && (this.m_room.name == 'E6S10' || this.m_room.name == 'E6S9'))
           )
            continue;
        m_hostiles.push(hCreep);
    }

    // Gather info/counts on the remaining...
    // TBD - maybe merge the previous loop with this one so there aren't
    // two passes...
    if(m_hostiles.length){
        this.m_rmem.hostileCt    = 0;
        this.m_rmem.hostileOwner = m_hostiles[0].owner.username;
        this.m_rmem.hostileLastT = Game.time;
        if(m_hostiles[0].owner.username != 'Invader'){
            this.m_rmem.assaultOwner = m_hostiles[0].owner.username;
            this.m_rmem.assaultLastT = Game.time;
        }

        let bodCt = {};
        let boostCt = {};
        for(let hi=0; hi<m_hostiles.length; hi++){
            let host = m_hostiles[hi];
            for(let bi=0; bi<host.body.length; bi++){
                let bodEl = host.body[bi];
                let btype = bodEl.type;
                let boost = bodEl.boost;
                if(!bodCt[btype])
                    bodCt[btype]=1;
                else
                    bodCt[btype]++;
                if(boost) {
                    if(!boostCt[btype])
                        boostCt[btype]=1;
                    else
                        boostCt[btype]++;
                }
            }
        }
        // TBD.. Why am I excluding certain creeps from this, should document it... I
        // guess just not to overreact when some probe walks in?? hmm...
        if(bodCt[ATTACK]>0 || bodCt[RANGED_ATTACK]>0 || bodCt[HEAL] > 0 || bodCt[WORK] > 0)
            this.m_rmem.hostileCt++;
        this.m_rmem.hostileBodCt = bodCt;
        this.m_rmem.hostileBoostCt = boostCt;
    }
    else{
        delete this.m_rmem.hostileCt;

        //delete this.m_rmem.hostileOwner; -- keep these to decide whether to stand down.. tbd for a limited time.
        //delete this.m_rmem.hostileLastT; --
        delete this.m_rmem.hostileBodCt;
        delete this.m_rmem.hostileBoostCt;
    }
    return m_hostiles;
}

// getWounded, return all creeps friendly to me that are in
// need of healing.
// Does a find only on demand but saves result.
RoomObj.prototype.getWounded = function()
{
    if(this.m_wounded)
        return this.m_wounded;
    m_wounded = this.m_room.find
                    (FIND_CREEPS
                    ,   { filter: function (cr)
                            {
                                return (cr.my && cr.hits < cr.hitsMax);
                            }
                        }
                    );
    return m_wounded;
}

// getFriendlies, return all creeps friendly to me
// Does a find only on demand but saves result.
RoomObj.prototype.getFriendlies = function()
{
    if(this.m_friendlies)
        return this.m_friendlies;
    m_friendlies = this.m_room.find
                    (FIND_CREEPS
                    ,   { filter: function (cr)
                            {
                                return (cr.my);
                            }
                        }
                    );
    return m_friendlies;
}


// getSites, return all sites in room.
// Does a find only on demand but saves result.
RoomObj.prototype.getSites = function()
{
    if(this.m_sites)
        return this.m_sites;
    return (this.m_sites = this.m_room.find(FIND_CONSTRUCTION_SITES));
}

// Returns a list of all adjacent free squares next to all sources
// in the room.
RoomObj.prototype.getHarvestPositions = function()
{
    if(this.m_harvestPositions)
        return this.m_harvestPositions;
    this.m_harvestPositions = [];
    let count=0;
    let sources = this.getSources();

    for(let si=0; si<sources.length; si++){
        let source = sources[si];

        let res = this.m_room.lookForAtArea
                (LOOK_TERRAIN
                ,source.pos.y-1
                ,source.pos.x-1
                ,source.pos.y+1
                ,source.pos.x+1
                ,true);
        for(let ri=0; ri<res.length; ri++){
            let rel = res[ri];
            if(rel.terrain == 'plain' || rel.terrain == 'swamp'){
                let position = { x: rel.x, y: rel.y, source: source, terrain: rel.terrain };
                this.m_harvestPositions.push(position);
            }
        }
    }

    // TBD... should really sort this by position (?)
    // Sources seem to come back reliably ordered, but I don't know that
    // we can guarantee that...

    return this.m_harvestPositions;
}

// Returns one harvest position, per source, trying to find a plains that
// is closest to spawn.
RoomObj.prototype.getDediHarvestPositions = function( hostrObj )
{
    let spawn = hostrObj.findTopLeftSpawn();

    if(!spawn)
        return [];

    if(this.m_dediHarvPositions)
        return this.m_dediHarvPositions;

    let hPos  = this.getHarvestPositions(true);
    let sources = this.getSources();
    let si;

    this.m_dediHarvPositions=[];
    for(si=0; si<sources.length; si++){
        let source = sources[si];

        // Find the first harvest position for the assigned source.
        // (Where, we will build a container for holding proceeds).  Choose
        // the closest, and hopefully plains.
        let hp;
        let hpDist;
        let hi;
        for(hi=0; hi<hPos.length; hi++){
            if(hPos[hi].source.id == source.id){
                let hpHi = hPos[hi];
                let hpHiDist = spawn.pos.getRangeTo(hpHi.x, hpHi.y);

                if(!hp){
                    hp = hPos[hi];
                    hpDist = spawn.pos.getRangeTo(hp.x, hp.y);
                }
                else {
                    if(hp.terrain == 'swamp' && hPos[hi].terrain == 'plain') {
                        hp = hPos[hi];
                        hpDist = spawn.pos.getRangeTo(hp.x, hp.y)
                    }
                    else {
                        let nDist = spawn.pos.getRangeTo(hPos[hi].x, hPos[hi].y);
                        if(nDist < hpDist  || (nDist == hpDist && (hPos[hi].y < hp.y || hPos[hi].x < hp.x))){
                            hp = hPos[hi];
                            hpDist = nDist;
                        }
                    }
                }
            }
        }
        if(!hp){
            console.log("BUG! BUG! BUG! Couldn't find harvest position for harv!");
            return true;
        }

        this.m_dediHarvPositions.push(hp);
    }
    return this.m_dediHarvPositions;
}

// Find harvest position for a designated source
RoomObj.prototype.getDediHarvestPosition = function( hostrObj, source )
{
    if(!this.m_dediHarvPositions)
        this.getDediHarvestPositions(hostrObj);
    if(!this.m_dediHarvPositions)
        return null;

    for(let pi=0; pi<this.m_dediHarvPositions.length; pi++){
        if(this.m_dediHarvPositions[pi].source.id == source.id)
            return this.m_dediHarvPositions[pi];
    }
    return null;
}

// Find container at dedicated harvest position for a designated source
RoomObj.prototype.getDediHarvestContainer = function( hostrObj, source )
{
    if(!this.m_dediHarvPositions)
        this.getDediHarvestPositions(hostrObj);

    if(!this.m_dediHarvPositions){
        console.log('WARN no harv pos in room '+this.m_room.name);
        return null;
    }

    //if(this.m_room.name == 'E77S98')
    //    console.log('getDediHarvestContainer source='+source.id);

    for(let pi=0; pi<this.m_dediHarvPositions.length; pi++){
        let hp = this.m_dediHarvPositions[pi];
        if(hp.source.id == source.id){
            // now source for container at this position
            let containers = this.getContainers();
            for(let ci=0; ci<containers.length; ci++){
                if(containers[ci].pos.x == hp.x
                   && containers[ci].pos.y == hp.y
                  ){
                    //if(this.room.name == 'E77S98')
                    //    console.log('.... x='+containers[ci].pos.x+' y='+containers[ci].pos.y);
                    return containers[ci];
                }
            }
        }
    }
    return null;
}

// Returns path (array not serialized) between spawn storage and source
// container (passed)
RoomObj.prototype.getDediHarvPath = function( container )
{
    let rmem = this.m_rmem;
    let pos = container.pos.x+'_'+container.pos.y;
    let spath;
    let path;
    let storage = this.getSpawnContainer();
    if(!storage)
        return null;

    let tObj = this;
    let tRmem = this.m_rmem;
    if(container.pos.roomName != this.m_room.name){
        tObj = RoomHolder.get(container.pos.roomName);
        tRmem = tObj.m_rmem;
    }

    if(tRmem.harvPath && tRmem.harvPath[pos]){
        spath = tRmem.harvPath[pos];
        path = Room.deserializePath(spath);
        return path;
    }

    let tRoom = tObj.m_room;
    path = tRoom.findPath
            (container.pos, storage.pos
            , { ignoreCreeps: true
              , ignoreRoads : false
              , maxRooms: 0
              }
            );

    spath = Room.serializePath(path);
    if(!tRmem.harvPath)
        tRmem.harvPath = {};
    tRmem.harvPath[pos] = spath;
    return path;
}


// Returns a single harvest position next to mineral source
// (where container will be built for storage)
// Actually return value just has x,y coords (not a full position).
// May optionally be pass the host room object, if remote mining in source keeper room.
RoomObj.prototype.getMineralHarvestPos = function( hrObj )
{
    if(this.m_mineralHarvPos)
        return this.m_mineralHarvPos;
    let mineral = this.getMineral();

    let tlspawn;
    if(hrObj)
        tlspawn = hrObj.findTopLeftSpawn();
    else
        tlspawn = this.findTopLeftSpawn();

    if(!mineral || !tlspawn)
        return null;

    let bestIdx;
    let bestVal;

    // Generally speaking we always want to find a position right next to the
    // mineral (at distance 1).  but in rare cases the only free land might
    // be right next to exit zone, where we can't place structures :(
    // So in those cases we need to search at increasing distance.)
    let dist;
    let res;
    for(dist=1; dist<=3; dist++){
        res = this.m_room.lookForAtArea
                (LOOK_TERRAIN
                ,mineral.pos.y-dist
                ,mineral.pos.x-dist
                ,mineral.pos.y+dist
                ,mineral.pos.x+dist
                ,true);

        for(let ri=0; ri<res.length; ri++){
            let rel = res[ri];
            let val;

            // Skip land next to exit (where we can't place containers grr)
            if(rel.x == 1 || rel.x == 48 || rel.y == 1 || rel.y == 48)
                continue;

            if(!hrObj || hrObj.m_room.name != this.m_room.name)
                val = 25;
            else
                val = tlspawn.pos.getRangeTo(rel.x, rel.y);

            if(rel.terrain == 'wall')
                continue;
            if(rel.terrain == 'swamp')
                val+= 1000;
            if(!bestVal || val < bestVal){
                bestIdx = ri;
                bestVal = val;
            }
        }
        if(bestIdx != null)
            break;
    }

    if(!bestVal)
        return null;
    return (this.m_mineralHarvPos = res[bestIdx]);
}

// Find container at mineral harvest position
// Find container at dedicated harvest position for a designated source
// May optionally be pass the host room object, if remote mining in source keeper room.
RoomObj.prototype.getMineralHarvestContainer = function(hrObj)
{
    let hp;
    if(!hrObj)
        hrObj = this;

    if(!this.m_mineralHarvPos)
        this.getMineralHarvestPos(hrObj);
    hp = this.m_mineralHarvPos;

    if(!hp)
        return null;

    let containers = this.getContainers();
    for(let ci=0; ci<containers.length; ci++){
        if(containers[ci].pos.x == hp.x
           && containers[ci].pos.y == hp.y
          ){
            return containers[ci];
        }
    }
    return null;
}

// Returns path (array not serialized) between storage and controller
// container.
RoomObj.prototype.getStoreControllerPath = function( )
{
    let rmem = this.m_rmem;
    let path;
    let storage = this.getSpawnStorage();
    if(!storage)
        return null;
    let container = this.getControllerContainer();
    if(!container)
        return null;

    if(rmem.ctrlPath){
        path = Room.deserializePath(rmem.ctrlPath);
        return path;
    }

    let room = this.m_room;
    path = room.findPath
            (container.pos, storage.pos
            , { ignoreCreeps: true
              , ignoreRoads : false
              , maxRooms: 0
              }
            );

    rmem.ctrlPath = Room.serializePath(path);
    return path;
}


// Returns true if this room is in the center of the sector (center of SK rooms)
RoomObj.prototype.isCenterRoom = function( )
{
    // If this homeroom can potentially harvest the center, go check it.
    let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(this.m_room.name);
    let fv = parsed[1];
    let sv = parsed[2];
    return (fv%10 == 5 && sv%10 == 5);
}


// Returns true if this room is one that's in position to harvest the center.
RoomObj.prototype.isCenterAccessRoom = function( )
{
    // If this homeroom can potentially harvest the center, go check it.
    let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(this.m_room.name);
    let fv = parsed[1];
    let sv = parsed[2];
    if(   ( (fv%10==3||fv%10==7) && sv%10 == 5)
        ||( (sv%10==3||sv%10==7) && fv%10 == 5)
      ){
        return true;
    }
    return false;
}


// Returns if the room's walls are breached.
RoomObj.prototype.getBreached = function( )
{
    this.getDefenceMatrix();
    return this.m_breached;
}

// Builds a cost matrix for movement in the room when in defence from hostiles.
// Also determines if the room is breached.
RoomObj.prototype.getDefenceMatrix = function( )
{
    if(this.m_defenceMatrix)
        return this.m_defenceMatrix;

    // Algorithm is to 'flood' out from spawn to try to figure out what
    // coordinates are inside walls.

    // 1) Start with a zeroed matrix.
    // 2) Fill with static terrain values for walls.  TerrainWall = 255
    // 3) Visit all wall structures, setting: TerrainWall = 255, Rampart = 20
    // 4) Push spawn position on stack.
    // 5) While stack not empty:
    //    a) pop node.
    //    b) Check static terrain if swamp.  Set cost to 5 if so.
    //       Else set cost to 2 to represent plains
    //    c) for each adjacent position:
    //       - if position is exit lane - mark matrix as breached.
    //       - if node is wall or rampart, skip it
    //       - if position isn't visited (value is 0), push on stack
    // 7) Visit all structures.  If the cost is zero, skip it (leave as zero for step 8)
    //    Else if road, set to matrix to 1, or for unwakable structures, set to 255.
    // 8) Walk through all of the matrix.  For any 0-value entries
    //    set value to 0xFF.

    // 1) Start with zeroed matrix
    costs = new PathFinder.CostMatrix;
    this.m_breached = false;

    // 2) Fill with static terrain values for walls.
    let rname = this.m_room.name;
    for(let x=1; x<=48; x++){
        for(let y=1; y<= 48; y++){
            let t = (Game.map.getTerrainAt(x,y,rname));
            if(t == 'wall')
                costs.set(x,y,0xff);
        }
    }

    // 3) Visit all wall structures, setting: TerrainWall = 255, Rampart = 20
    this.m_rampartsWalls.forEach(function(st){
        if(st.structureType == STRUCTURE_WALL)
            costs.set(st.pos.x,st.pos.y,0xFF);
        else
            costs.set(st.pos.x,st.pos.y,20);
    })

    // 4) Push spawn position on stack.
    let sp = this.findTopLeftSpawn();
    visitStack = [ ];
    visitStack.push(sp.pos);

    // 5) While stack not empty:
    while(visitStack.length != 0){

        // a) pop position.
        pos = visitStack.pop();

        // b) Check static terrain if swamp.  Set cost to 5 if so.
        //    Else set cost to 2 to represent plains
        let t = (Game.map.getTerrainAt(pos.x,pos.y,rname));
        if(t == 'plain')
            costs.set(pos.x,pos.y,2);
        else if (t == 'swamp')
            costs.set(pos.x,pos.y,5);
        else {
            console.log("BUG! pos="+JSON.stringify(pos)+" got terrain "+t+", shouldn't get here");
            return null;
        }

        // c) for each adjacent position:
        //    - if position is exit lane - mark matrix as breached.
        //    - if node is wall or rampart, skip it
        //    - if position isn't visited (value is 0), push on stack
        for(let dx=-1; dx<=1; dx++){
            for(let dy=-1; dy<=1; dy++){
                if(dx == 0 && dy == 0)
                    continue;
                if( (pos.x+dx) == 0 || (pos.x+dx) == 49 || (pos.y+dy) == 0 || (pos.y+dy) == 49 ) {
                    let t2 = (Game.map.getTerrainAt(pos.x+dx,pos.y+dy,rname));
                    if(t2 != 'wall')
                        this.m_breached = true;
                }
                else{
                    let c = costs.get(pos.x+dx,pos.y+dy);
                    if(c == 0)
                        visitStack.push( {x: (pos.x+dx), y: (pos.y+dy) } )
                }
            }
        }
    }

    // 7) Visit all structures.  If the cost is zero, skip it (leave as zero for step 8)
    //    Else if road, set to matrix to 1, or for unwakable structures, set to 255.
    this.m_allStruct.forEach(function(st){
        if(costs.get(st.pos.x, st.pos.y) != 0 ) {
            switch(st.structureType){
            case STRUCTURE_ROAD:
                costs.set(st.pos.x, st.pos.y, 1);
                break;
            case STRUCTURE_CONTAINER:
                // Walkable, just leave at whatever else was set
                break;
            case STRUCTURE_WALL:
                // Walkable, should already have set this.
                break;
            case STRUCTURE_RAMPART:
                // Walkable, should already have set this.
                break;
            default:
                // Should be an unwalkable struct
                costs.set(st.pos.x, st.pos.y, 0xFF);
                break;
            }
        }
    })

    // 8) Walk through all of the matrix.  For any 0-value entries
    //    set value to 0xFF.
    for(let x=1; x<=48; x++){
        for(let y=1; y<= 48; y++){
            if(costs.get(x,y) == 0 )
                costs.set(x,y,0xff);
        }
    }
    this.m_defenceMatrix = costs;
}

//-------------------------------------------------------------
// Room spawn logic handling
//----------------------------------------------------------------------

// Invoked once per tick to loop through all rooms and invoke spawn logic
// per each room.
RoomObj.spawnLoop = function ()
{
    mySpawnRooms = RoomHolder.getMySpawnRooms();
    for(let sri=0; sri<mySpawnRooms.length; sri++){
        let rObj = mySpawnRooms[sri];
        rObj.spawnLogic(rObj);
    }

    /*
    allRooms = RoomHolder.getAllRooms();

    for(let rName in allRooms){
        let roomObj = allRooms[rName];
        let room    = roomObj.m_room;

        if(!room)
            continue;
        if(!room.controller || !room.controller.my)
            continue;

        roomObj.spawnLogic(roomObj);
    }*/
};

// Invoked once per tick to run room planner logic.
RoomObj.plannerLoop = function()
{
    allRooms = RoomHolder.getAllRooms();

    for(let rName in allRooms){
        let roomObj = allRooms[rName];

        if(!roomObj.m_room)
            continue;

        RoomPlanner.planRoom(roomObj);
    }
}


// Invoked once per tick to run room observer logic.
RoomObj.observerLoop = function()
{
    // TBD - the one downside of this new logic is that every room observes
    // every turn.  That probably increases the number of rooms to parse
    // fairly dramatically... Probably should throttle this somewhat to
    // at least one per number of sectors owned.

    for(let rName in mySpawnRooms){
        let roomObj = mySpawnRooms[rName];

        if(!roomObj.m_room)
            continue;
        let obs = roomObj.getObserver();
        if(!obs)
            continue;

        let lastRoom = roomObj.m_rmem.obsLastRoom;
        if(!lastRoom)
            lastRoom = roomObj.m_rmem.obsLastRoom = roomObj.m_room.name;

        let roomCo   = new RoomCoord(roomObj.m_room.name);
        let lastCo   = new RoomCoord(lastRoom);

        // Get coordinate (trying to advance one to right)
        let nextDx       = (lastCo.x - roomCo.x) + 1;
        let nextDy       = (lastCo.y - roomCo.y);

        // Keep within range 10 of observer's room.
        if(nextDx > 10){
            nextDx -= 21;
            nextDy += 1;
            if(nextDy > 10)
                nextDy -= 21;
        }

        // Get new coords based on that dx,dy
        let nextRoom   = roomCo.getNeighbor(nextDx, nextDy);

        let rc = obs.observeRoom(nextRoom);
        roomObj.m_rmem.obsLastRoom = nextRoom;
    }
}

// Invoked once per tick to loop through all rooms and invoke tower logic
// per each room.
RoomObj.towerLoop = function ()
{
    mySpawnRooms = RoomHolder.getMySpawnRooms();
    for(let sri=0; sri<mySpawnRooms.length; sri++){
        let roomObj = mySpawnRooms[sri];
        let towers  = roomObj.getTowers();
        let hostiles = roomObj.getHostiles();
        let wounded = roomObj.getWounded();

        if(
            towers && towers.length
            &&  (
                    (hostiles && hostiles.length > 0)
                ||  (wounded && wounded.length > 0)
                )
            ){
            TowerController.towerRun(roomObj, towers, hostiles, wounded);
        }
    }

    /*
    allRooms = RoomHolder.getAllRooms();

    for(let rName in allRooms){
        let roomObj = allRooms[rName];

        let room    = roomObj.m_room;
        if(!room)
            continue;
        if(!room.controller || !room.controller.my)
            continue;

        let towers  = roomObj.getTowers();
        let hostiles = roomObj.getHostiles();
        let wounded = roomObj.getWounded();

        if(
            towers && towers.length
            &&  (
                    (hostiles && hostiles.length > 0)
                ||  (wounded && wounded.length > 0)
                )
            ){
            TowerController.towerRun(roomObj, towers, hostiles, wounded);
        }
    }*/
};

// Generates an overview report of room status
RoomObj.roomSummaryReport = function ()
{
    mySpawnRooms = RoomHolder.getMySpawnRooms();
    console.log('------- Room Summary --------');
    for(let sri=0; sri<mySpawnRooms.length; sri++){
        let roomObj = mySpawnRooms[sri];
        let room = roomObj.m_room;
        let hostiles = roomObj.getHostiles();
        let wounded = roomObj.getWounded();
        let ctrl = roomObj.m_room.controller;
        let ctrlLev = ctrl.level;
        let wrn = "";
        let exten = roomObj.getExtensions();
        let extenLimit = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][ctrlLev];
        let towers = roomObj.getTowers();
        let towerLimit = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][ctrlLev];
        let labs = roomObj.getLabs();
        let labLimit = CONTROLLER_STRUCTURES[STRUCTURE_LAB][ctrlLev];
        let spawns = roomObj.getSpawns();
        let spawnLimit = CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][ctrlLev];
        let nuker = roomObj.getNuker();

        if(exten.length < extenLimit)
            wrn = wrn + " EXTEN_MISSING";
        if(towers.length < towerLimit)
            wrn = wrn + " TOWER_MISSING";
        if(labs.length < labLimit)
            wrn = wrn + " LAB_MISSING";
        if(spawns.length < spawnLimit)
            wrn = wrn + " SPAWN_MISSING";
        if(!nuker && ctrlLev == 8)
            wrn = wrn + " NUKER_MISSING";
        if(ctrl.level != 8){
            let progress = Math.floor(room.controller.progress / room.controller.progressTotal * 1000000)/10000;
            wrn = wrn + " UPGRADING="+progress+"%";
        }

        // Note that the following does show 'breached' if there is an opening to
        // a neighbor room that itself is closed off.  Not going to tackle that for now..
        let breached = roomObj.getBreached();
        if(breached)
            wrn = wrn + " BREACHED";

        console.log(roomObj.m_room.name +' L'+ctrl.level+' '+wrn);
    }

};


RoomObj.prototype.spawnLogic = function( roomObj )
{
    let room       = this.m_room;
    let controller = room.controller;
    let spawns     = this.getSpawns();

    // Find if we have an active spawn.  We'll only do one spawn per
    // game loop.
    let si;
    let spawn;
    for(si=0; si<spawns.length; si++){
        spawn = spawns[si];
        if(!spawn.spawning)
            break;
    }
    if(si == spawns.length)
        return;


    if(roomObj.getHostiles().length > 0){
        if(Role_TowerFill.spawn( spawn, roomObj ))
            return;
    }

    //console.log(spawn.room.name+' ECap = '+spawn.room.energyCapacityAvailable);

    // We will now invoke multiple spawn routines in a rough priority order
    // according to the needs of the room.   Each of these routines is
    // expected to routine "true" if it either successfully spawned a creep,
    // or also if it needs to spawn, but doesn't have the room energy and
    // needs to wait.  A false return moves on to next creep type.
    //   Generally, the logic to decide if that creep type is needed belongs
    // in the spawn routines, not here.

    // First room bootstrappers
    if(Role_FRBootstrap.spawn( spawn, roomObj))
        return;

    //if(Role_MiniAttack.spawn( spawn, roomObj))
    //    return;

    // Spawn home room energy distribution
    if(Role_Distributor.spawn( spawn, roomObj))
        return;

    // Spawn boosted defenders if under user attack.
    if( roomObj.getHostiles().length > 1
        && roomObj.m_rmem.hostileOwner != 'Invader'
      ){

        if(Role_TstGrunt.spawn( spawn, roomObj, roomObj.m_room.name, 2))
            return;
        if(Role_TstHeal.spawn( spawn, roomObj, roomObj.m_room.name, 2))
            return;

    }


    // Manually attacking Tst bots..
    let tstBotFromRm = 'W13N25';
    let tstBotToRm   = 'W14N21';
    if ( false && roomObj && (roomObj.m_room.name == tstBotFromRm) ) {
        if(Role_TstHeal.spawn( spawn, roomObj, tstBotToRm, 1))
            return;
        if(Role_TstGrunt.spawn( spawn, roomObj, tstBotToRm, 1))
            return;
        if(Role_TstDecon.spawn( spawn, roomObj, tstBotToRm, 1))
            return;
        if(Role_TstHeal.spawn( spawn, roomObj, tstBotToRm, 2))
            return;
        if(Role_TstGrunt.spawn( spawn, roomObj, tstBotToRm, 2))
            return;
        if(Role_TstDecon.spawn( spawn, roomObj, tstBotToRm, 2))
            return;
        //if(Mil_Looter.spawn(spawn, roomObj, 'E2S13', 5))
        //    return;
    }

    // Spawn home room dedicated harvesters.
    if(Role_DediHarv.spawn( spawn, roomObj, room.name, roomObj))
        return;

    // Spawn home room dedicated harvesters.
    if(Role_OptMover.spawn( spawn, roomObj, room.name))
        return;

    // Spawn home room repair
    if(Role_Repair.spawn( spawn, roomObj, room.name))
        return;

    // Spawn neighbor probe
    if(Role_Probe.spawn( spawn, roomObj))
        return;

    // Spawn storage/terminal/linker.
    if(Role_Linker.spawn( spawn, roomObj))
        return;


    // TBD.. I've gone back and forth on where to put this.
    // Earlier is better because:
    //    -- related creeps tend to spawn closer together.
    //    -- it's more immediately reactive to new threats.
    // But... it has potential to starve out neighbors and
    //     cause the rooms to die from lack of repair.
    //
    // For short term defensive responses, this is the right thing to do.
    // For small scale assaults, it's maybe ok.
    // For large scale assaults, it's definitely not (and starved my economy to
    //    near death at one point).
    //
    // I probably need a sort of multi-phase military spawning.  But for now,
    // favor defence.
    if(Generalissimo.doSpawn(spawn, roomObj))
        return;

    // Spawn controller upgraders and their energy feeders.
    // I'm doing this before room feeds and bootstrapping and think it should
    // stay here, because, don't forget that these bots do moderate themselves.
    // The problem is they tend to starve bootstrapping... until we get to L7
    // spawns.  Which won't be a problem once we do.   Unfortunately I don't have
    // a great solution to that rather than just moving this logic around.
    if(Role_CtrlUpgrade.spawn( spawn, roomObj))
        return;
    if(Role_CtrlMover.spawn( spawn, roomObj))
        return;


    if(Role_Miner.spawn( spawn, roomObj, room.name ))
        return;

    if(Role_Minecart.spawn( spawn, roomObj, room.name ))
        return;

    if(Role_Chemist.spawn(spawn, roomObj))
        return;

    let nNeigh = 0;
    exits = Game.map.describeExits(room.name);
    for( dir in exits ){
        let neighRoomName = exits[dir];
        let nObj = RoomHolder.get(neighRoomName);

        if(!nObj)
            continue;
        if(!nObj.m_rmem.hostRoom)
            nObj.m_rmem.hostRoom = room.name;
        if(nObj.m_rmem.hostRoom != room.name)
            continue;

        // Don't spawn normal creeps if room is hostile.
        // (A division should be sent earlier by Generalissimo)
        // Note we ignore source keeper rooms here, we'll do more on this
        // later at lower priority.
        if( !nObj
            || nObj.m_rmem.hostileCt
            || nObj.m_rmem.keeperRoom
            || !nObj.m_room
            || ( nObj.m_rmem.owner != "nouser" && nObj.m_rmem.owner != "me")
            ) {
            continue;
        }

        // Skip if own the neighbor room (not just reserved it)
        if(nObj && nObj.m_room && nObj.m_room.controller && nObj.m_room.controller.my){
            continue;
        }

        // If this room is a newly building room, we'll start spawning
        // at L3, but we need to build paths first and finish local
        // structures, or spending local energy will be wasted.
        // So at L3, don't spawn unless the room planner is completed.
        // (At higher levels this is less of an issue since we're just
        // upgrading an already working infrastructure)
        if(roomObj.m_room.controller.level == 3 && !roomObj.m_rmem.lastPlanT)
            continue;

        // Don't host more than 3 neighbors if we haven't reached L7 and
        // are trying to boot someone - we'll never get to the bootstrap.
        if(Preference.bootEnabled && roomObj.m_room.name == Preference.hostRoomName
             && ++nNeigh >= 4 && roomObj.m_room.controller.level < 7)
            continue;

        if(Role_Reserve.spawn ( spawn, roomObj, neighRoomName ))
            return;

        if(Role_DediHarv.spawn ( spawn, roomObj, neighRoomName, nObj ))
            return;

        if(Role_Repair.spawn ( spawn, roomObj, neighRoomName ))
            return;

        if(Role_OptMover.spawn ( spawn, roomObj, neighRoomName ))
            return;
    }

    //--------------------------------------------------
    // Boostrapping -
    let hostRoomName = Preference.hostRoomName;
    let bootRoomName = Preference.bootRoomName;
    let bootEnabled  = Preference.bootEnabled;

    if( (!Preference.bootEnabled) || Preference.bootRoomName != roomObj.m_room.name)
        roomObj.m_rmem.selfBooting = true;

    if(Role_NewRoomProbe.spawn(spawn, roomObj, hostRoomName, bootRoomName))
        return;

    let brObj;
    if(bootEnabled)
        brObj = RoomHolder.get(bootRoomName);
    if(brObj){
        if(Role_ClaimController.spawn(spawn, roomObj, hostRoomName, bootRoomName))
            return;

        if(roomObj.m_room.name == hostRoomName){
            if(roomObj.m_room.controller.level <= 6){
                // Tell the room to self boot with FR bootstraps.  We aren't
                // at a level to fully support it yet.  We just need enough
                // to get the spawn up.
                brObj.m_rmem.selfBooting = true;
            }
            else {
                brObj.m_rmem.selfBooting = false;
            }
        }

        if(spawn.room.name != bootRoomName && brObj.m_room && brObj.m_room.controller.my){
            let brExtenList = brObj.getExtensions();
            let haveAllExtens = (brExtenList.length >= CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][brObj.m_room.controller.level]);

            if( !(brObj.getTerminal()) || !haveAllExtens ) {
                let brSpStorage = brObj.getSpawnStorage();
                let brIsStorage = (brSpStorage && brSpStorage.structureType == STRUCTURE_STORAGE && brSpStorage.my);

                // Once we've build storage, stop the bootstraps.  At that point room can pretty
                // reasonably get enough energy in and build its own controller upgraders.
                // But do boot if not all extensions are built -- we may be recovering a failed
                // (or destroyed) room.
                if(!brIsStorage || !haveAllExtens){
                    let src = brObj.getSources();
                    let nSrc=src.length;
                    if(Role_RemoteBootstrap.spawn( spawn, roomObj, hostRoomName, bootRoomName, 3*nSrc))
                        return;
                }

                // We'll keep moving energy until terminal exists -- unless its self booting
                // (host is too new to afford supporting it)
                if(!brObj.m_rmem.selfBooting && !(brObj.getTerminal())){
                    if(Role_BootMover.spawn(spawn, roomObj, hostRoomName, bootRoomName, 5))
                        return;
                }
                else {
                    if(roomObj.m_room.name == hostRoomName)
                        console.log('T='+Game.time+' Skipping spawns to boot room - is complete (time to disable boot) self='+brObj.m_rmem.selfBooting);
                }
            }
        }
    }

    //--------------------------------------------------

    // Spawn wall repair
    // This is generally low priority.  However, if attacked we
    // should perhaps consider spawning higher.
    if(Role_Mason.spawn ( spawn, roomObj ))
        return;

    // Source keeper neighbor handling.  Do this last, as it's fairly
    // intensive in spawn pressure.
    let trm = roomObj.getTerminal();
    for( dir in exits ){
        let neighRoomName = exits[dir];
        let nObj = RoomHolder.get(neighRoomName);


        // We need a pretty stable room to support SK rooms.. else we can
        // starve our home upkeep spawning big baddies to support it.
        if(controller.level < 8 || !roomObj.m_rmem.lastPlanT || !trm || trm.store[RESOURCE_ENERGY] < 1000)
            continue;

        if(!nObj || ! nObj.m_room)
            continue;

        if(!nObj.m_rmem.hostRoom)
            nObj.m_rmem.hostRoom = room.name;
        if(nObj.m_rmem.hostRoom != room.name)
            continue;
        if( !nObj || !nObj.m_rmem.keeperRoom )
            continue;


        if(Role_SK_Clear.spawn ( spawn, roomObj, nObj, neighRoomName ))
            return;
        if(Role_Miner.spawn( spawn, roomObj, neighRoomName ))
            return;
        if(Role_Minecart.spawn( spawn, roomObj, neighRoomName ))
            return;
        if(Role_DediHarv.spawn ( spawn, roomObj, neighRoomName, nObj ))
            return;
        if(Role_Repair.spawn ( spawn, roomObj, neighRoomName ))
            return;
        if(Role_OptMover.spawn( spawn, roomObj, neighRoomName))
            return;
    }
    //if(roomObj.m_room.name == 'E2S13'){
        // Special case diagonal room for repairing paths only..
    //    let neighRoomName = 'E3S12';
    //    let nObj = RoomHolder.get(neighRoomName);
    //    if(nObj && nObj.m_room) {
    //        nObj.m_rmem.hostRoom = 'E2S13';
    //        if(Role_Repair.spawn ( spawn, roomObj, neighRoomName ))
    //           return;
    //    }


    // Center SK neighbor handling.  This needs some work, very hardcoded so far.
    // Especially in that we need RoomPlanner work.
    if(roomObj.m_room.name == 'W5N33'){
        let neighRoomName = 'W5N35';
        let nObj = RoomHolder.get(neighRoomName);
        if(nObj && nObj.m_room) {
            nObj.m_rmem.hostRoom = 'W5N33';
            if(Role_Repair.spawn ( spawn, roomObj, neighRoomName ))
                return;
            if(Role_Miner.spawn( spawn, roomObj, neighRoomName ))
                return;
            if(Role_Minecart.spawn( spawn, roomObj, neighRoomName ))
                return;
            if(Role_DediHarv.spawn ( spawn, roomObj, neighRoomName, nObj ))
                return;
            if(Role_OptMover.spawn( spawn, roomObj, neighRoomName))
                return;
        }
    }

    // Sector probe - doesn't cost much but any room in the sector will satisfy it,
    // and very low priority.
    if(Role_SectorProbe.spawn( spawn, roomObj))
        return;

};



module.exports = RoomObj;

