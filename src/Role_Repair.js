
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');


// Role_Repair is a simple worker creep to spawn itself and walk around
// repairing, when structures get below certain thresholds.
// It will also build sites, but the intent here is room upgrade not bootstrap.
// (It has a light MOVE build so needs roads).  We use it to build initial roads in
// neighbor remote harvesting rooms -- but there it will primarily move from the
// DediHarv containers where it finds energy and builds roads away.  (and moves into the
// room empty so no MOVE for CARRY needed)


//----------------------------------------------
// Some notes on repair efficiency and room needs
//
// Each road in the room decays at a rate of 100 hits every 1000 turns.
//    More frequently accessed roads decay more frequently based on the
//    number of body parts.  I don't really have any data to say how often
//    the decay rate is in practice...  lets say 100 hits every 300 turns.
//    or .3 hits per turn.
//
// Each container in the room decays at a rate of 5000 hits every 100 turns.
//    We typically have 3 of them (controller & 2x source).
//
// Each WORK repairs a struct 100 hits on creep.repair(), and consumes 1 E.
//
// Excluding creep repair cost itself and creep efficiency, what is the
// energy that needs to go into repairing the structures?
//
// The average room has around 100 roads (we could do more to optimize this).
//     100 roads * . 3 hits       1 energy
//                 ---------  *  -----------  = .3 energy
//                    turn       100 hits          /turn
//
// The average room has 3 containers (controller & 2x source)
//
//      3 containers  * 50 hits   * 1 energy
//                      -------     ---------   = 1.5 energy/turn
//                      turn         100 hits
//
// So, containers are the biggest repair consumer, and number of roads isn't
// really that big of a deal.
//
// But we do need around 2 energy per turn average repair rate to keep up.
//
// Based on this, I'm going to try using a creep with 2 x WORK, 2 x CARRY
// (and 2x MOVE) to start with.
//
// If that's more than really needed, watermarks will keep it from being too wasteful.
//
// Do note that the cost of the creep itself is 400, so, and additional .26 E /turn.
//------------------------------------------------
// Additional notes 8/18/17
//
// I think my math must have worked out pretty decently.  In a pretty stable config without
// a lot of site building expansion, i'm seeing a mean of around 18-20 repair creeps active
// at all times, with about 12 core rooms.   (Do keep in mind that most rooms have around
// 3 remote harvest rooms on average, so roughly half of the rooms that ever need repair have
// repair creeps.)  Seems like a decent balance.
//
// The only question on my mind is if we should be more aggresive about repairing 'faster'
// with a bigger creep, and then having that creep reclaim when we hit high watermark for room.
// Doing that could reduce CPU cost further if we really keep most rooms idle.  A TBD.
//------------------------------------------------
//


const BODY_NOSITES_M1 = [ WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE ];
const BODY_NOSITES_M1_COST = 600;


const BODY_SITES_M2 = [ WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE ];
const BODY_SITES_M2_COST = 550;


const BODY_SITES_M3 = [ WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE ];
const BODY_SITES_M3_COST = 850;

const BODY_SITES_M4 = [ WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE ];
const BODY_SITES_M4_COST = 1250;

const BODY_SITES_M5 = [ WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK
                      , CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY
                      , CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY
                      , MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE
                      , MOVE, MOVE, MOVE, MOVE, MOVE, MOVE
                      ];
const BODY_SITES_M5_COST = 2800;


// Repair thresholds.
//
// Low watermark -- we won't actively seek and move to a structure til it is
// below this percent hits.
const REPAIR_LOW_WATERMARK = .50;

// High watermark -- but if we're in the area, and have energy left, we'll
// repair structures below this level.
const REPAIR_HIGH_WATERMARK = .75;

class Role_Repair extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, hrObj, targetRoomName) {
        let room        = spawn.room;
        let controller  = room.controller;
        let body;
        let cost;
        let max;

        // Make sure room has reached L3 and at least 8 extensions.
        // (else bootstrappers cover us)
        if(controller.level < 3)
            return false;

        if(controller.level == 3) {
            let exten = hrObj.getExtensions();
            if(exten.length < 10)
                return false;
        }

        // Don't spawn repair bots unless we are below the low watermark
        let trObj  = RoomHolder.get(targetRoomName);

        // Wait for a probe or some activity in the room.
        if(!trObj || ! trObj.m_room)
            return false;

        let sites  = trObj.getSites();
        let containers = trObj.getContainers();
        let spStorage = hrObj.getSpawnStorage();

        // Once we get storage we tend to be able to build some pretty big repair creeps
        // that can starve out storage.  make sure we've built up some to spend.
        // NOTE.. I was very tempted to remove this at one point where a room was failing to
        // repair itself after other troubles.  But decided the problem there was more spawn
        // logic over-spawning (it was trying to keep a SK room alive when itself was pretty dead).
        // So... keep that sort of situation in mind if you run into this again.
        if(!spStorage || (spStorage.structureType == STRUCTURE_STORAGE && spStorage.store.energy < 5000))
            return false;


        if(sites.length == 0 && trObj.m_minRepairPercent > REPAIR_LOW_WATERMARK)
            return false;

        // We'll spawn in keeper rooms even without containers to help the dediharvs get
        // established.  This tends to be important when first starting -as the keepers
        // 'walk' over the construction site dumping E... which can then be used to
        // help boot it up more quickly by repair.
        if(!trObj.m_rmem.keeperRoom && targetRoomName != room.name && containers.length == 0)
            return false;

        if(targetRoomName == room.name && !spStorage)
            return false;

        // Choose the body we want and will wait for energy for.
        if(room.energyCapacityAvailable >= BODY_NOSITES_M1_COST){
            body = BODY_NOSITES_M1;
            cost = BODY_NOSITES_M1_COST;
            max=1;
            if(trObj.m_minRepairPercent < REPAIR_LOW_WATERMARK/2)
                max = 2;
        }

        // If there are sites, consider upgrade to carry more, as we can end up
        // traversing a lot of ground for road builds.
        //   We also do this as a general rule in keeper rooms, which just have
        // a lot more to repair and a lot more wasted time avoiding source
        // keepers.
        if(sites.length > 0 || trObj.m_rmem.keeperRoom || trObj.isCenterRoom()){
            if(room.energyCapacityAvailable >= BODY_SITES_M5_COST){
                body = BODY_SITES_M5;
                cost = BODY_SITES_M5_COST;
                max = 2;
            }
            else if(room.energyCapacityAvailable >= BODY_SITES_M4_COST){
                body = BODY_SITES_M4;
                cost = BODY_SITES_M4_COST;
                max = 2;
            }
            else if(room.energyCapacityAvailable >= BODY_SITES_M3_COST){
                body = BODY_SITES_M3;
                cost = BODY_SITES_M3_COST;
                max = 2;
            }
            else if(room.energyCapacityAvailable >= BODY_SITES_M2_COST){
                body = BODY_SITES_M2;
                cost = BODY_SITES_M2_COST;
                max = 2;
            }
        }

        //console.log('Repair cost ='+cost+' available='+room.energyAvailable);

        // Wait for it, if not yet available
        if(room.energyAvailable < cost)
            return true;

        // Find a free name and spawn the bot.
        // We spawn these repair only on demand due to broken sites,
        // and there's not a lot of urgency to that, so no alt need.
        let crname = Creep.spawnCommon(spawn, 'repair', body, max, 0, "", targetRoomName);
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];

        // Initialze memory for the role.
        crmem.state = 'moveTargetRoom';

        delete crmem.instance;
        return true;
    };


    // Logic callback invoked to have a creep run it's actions - derived from
    // base Creep class (a 'virtual function' or whatever you call it in JS).
	runLogic()
	{
	    let crmem = this.m_crmem;
	    let creep = this.m_creep;
	    let tRoom;
	    let tName;
	    if(crmem.tRoomName) {
	        tRoom = Game.rooms[crmem.tRoomName];
	        tName = crmem.tRoomName;
	    }
	    else{
	        tRoom = Game.rooms[crmem.homeName];
	        tName = crmem.homeName;
	    }
	    let trObj  = RoomHolder.get(tName);
	    let rObj   = RoomHolder.get(creep.room.name);
	    let hrObj  = RoomHolder.get(crmem.homeName);
        let tRmem  = trObj.m_rmem;
	    let rc;
	    let maxLoop = 6;
	    let exceed;
	    let si;
	    let debug="";
	    let minStruct;
	    let minPct;

	    // Defence
	    if(this.commonDefence(creep, rObj, hrObj, trObj)){
	        crmem.state = 'moveTargetRoom';
	        this.clearTarget();
	        return;
	    }

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'repair_W13N25_W14N25_0')
            //    console.log(Game.time+' '+creep.name+' state='+crmem.state);

            switch(crmem.state){

            case 'moveTargetRoom':
                rc=this.actionMoveToRoomRouted(tName);
                if(rc == OK) {
                    crmem.state = 'pickEnergy';
                    break;
                }
                return;

            case 'pickEnergy':
                let dropped = rObj.getDroppedResources();
                if(dropped && dropped.length > 0){
                    let drop=creep.pos.findClosestByPath
                        (dropped
                        ,   { filter: function (dr)
                                {
                                    return (   (trObj.m_rmem.keeperRoom || creep.pos.getRangeTo(dr.pos) <= 6)
                                            && dr.resourceType == RESOURCE_ENERGY)
                                }
                            }
                        );
                    if(drop){
                        this.setTarget(drop);
                        crmem.state = 'getDropped';
                        break;
                    }
                }

                if(crmem.tRoomName && creep.room.name != crmem.tRoomName){
                    crmem.state = 'moveTargetRoom';
                    break;
                }
                let sto = trObj.getSpawnStorage();

                if(sto && sto.structureType != STRUCTURE_CONTAINER && !sto.my){
                    // Rare case, but someone left their junk in my room.
                    // destroy it.
                    if(creep.pos.getRangeTo(sto)>1)
                        this.actMoveTo(sto);
                    else
                        creep.dismantle(sto);
                }

                if(sto && sto.structureType == STRUCTURE_STORAGE && sto.store.energy < 2000){
                    // In mining rooms with a single source, repair guys can actually
                    // starve out the room.  Don't let that happen, just sleep a bit.
                    return;
                }

                if(!sto || sto.store.energy == 0){
                    // In remote harvesting rooms we just source off dediharv
                    // containers.  At home, if we're doing initial builds
                    // we might resort to there too.
                    let containers = trObj.getContainers();
                    let container= creep.pos.findClosestByPath
                                    (containers
                                    ,   { filter: function (st)
                                            {
                                                return (st.store.energy >= 150);
                                            }
                                        }
                                    );
                    if(container == null)
                        return;
                    sto = container;
                }
                this.setTarget(sto);
                crmem.state = 'withdrawStruct';
                break;

            case 'getDropped':
                rc=this.pickupDropped(RESOURCE_ENERGY);
                if(rc == ERR_FULL){
                    crmem.state = 'pickBuild';
                    break;
                }
                if(rc == OK)
                    return;
                crmem.state = 'pickEnergy';
                if(rc == ERR_NOT_ENOUGH_RESOURCES || rc == ERR_NO_PATH)
                    return;
                break;

            case 'withdrawStruct':
                rc=this.withdrawStruct(RESOURCE_ENERGY);
                if(rc == ERR_FULL){
                    crmem.state = 'pickBuild';
                    break;
                }
                if(rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    // target is cleared so we do need to re-pick.
                    crmem.state = 'pickEnergy';
                    return;
                }
                if(rc == ERR_NO_PATH){
                    crmem.state = 'pickEnergy';
                    return;
                }
                crmem.state = 'pickEnergy';
                break;

            case 'pickBuild':
                // When building ramparts, we need to repair quickly after building.
                // Check if there's a structure below 1000 hits, and if so, focus on repairing it
                // before we build anything new.
                minStruct = trObj.m_minRepairStruct;
                if(minStruct && minStruct.hits < 1000){
                    this.setTarget(minStruct);
                    crmem.state = 'repairStruct';
                    break;
                }

                // Check if there are sites to be built, and build.  RoomPlanner
                // places these and prioritizes for growth. So any site we find.
                let sites = trObj.getSites();
                let found = false;
                let site = creep.pos.findClosestByRange(sites);
                if(site){
                    this.setTarget(site);
                    crmem.state = 'buildSite';
                    break;
                }
                crmem.state = 'pickRepair';
                break;

            case 'buildSite':
                rc=this.buildSite();
                //debug = debug + '\tbuildSite rc='+rc+'\n';
                if(rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    crmem.state = 'pickEnergy';
                    break;
                }
                if(creep.carry.energy == 0)
                    crmem.state = 'pickEnergy';
                else {
                    // When building we tend to complete a site, then the
                    // planner will place the next on the next turn.
                    // So go back to pickBuild, but return and wait a turn
                    crmem.state = 'pickBuild';
                    return;
                }
                break;

            case 'pickRepair':
                let struct;

                // When repairing, we want to fully repair a target to the high
                // water mark, before switching targets, making it a little different
                // than many other actions.  the Creep::repairStruct still clears
                // the target, so we keep a separate variable to preserve a
                // target once picked.
                if(crmem.savedTargetId){
                    // Lookup object and see if it's over high watermark, if so clear.
                    struct = Game.getObjectById(crmem.savedTargetId);
                    if( !struct || (struct.hits / struct.hitsMax) >= REPAIR_HIGH_WATERMARK){
                        delete crmem.savedTargetId;
                    }
                    else {
                        this.setTarget(struct);
                        crmem.state = 'repairStruct';
                        break;
                    }
                }

                // Else we need a new target.
                // Check if there are sites to repair - something we begin to
                // need at L3 as we place/build roads.
                minStruct = trObj.m_minRepairStruct;
                minPct = trObj.m_minRepairPercent;

                // TBD, if there's nothing, we should perhaps just reclaim.
                if(!minStruct || minPct >= .95){
                    crmem.state = 'moveReclaim';
                    return;
                }
                this.setTarget(minStruct);
                crmem.savedTargetId = minStruct.id;
                crmem.state = 'repairStruct';
                break;

            case 'repairStruct':
                rc=this.repairStruct();
                debug = debug+'... rc='+rc+'\n';
                if( rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES || creep.carry.energy == 0)
                    crmem.state = 'pickEnergy';
                else if(rc == ERR_INVALID_TARGET){
                    let structs = trObj.getAllStructures();

                    // We still have energy but finished with this repair.
                    // Repair tends to bounce us around, so while we're in the
                    // area, look for structs that aren't fully degraded to
                    // the low watermark, but are still in need of repair and
                    // below the high watermark. This avoids us bouncing around
                    // from target to target, using remaining energy on targets
                    // of opportunity in area.
                    let struct =
                    creep.pos.findClosestByRange
                        (structs,
                            { filter: function (st)
                                {
                                    if(st.structureType == STRUCTURE_CONTROLLER)
                                        return false;
                                    if( ( st.structureType == STRUCTURE_WALL || st.structureType == STRUCTURE_RAMPART)
                                        && st.hits > 500
                                       )
                                        return false;
                                    return (st.hits <= REPAIR_HIGH_WATERMARK * st.hitsMax);
                                }
                            }
                        );
                    if(struct){
                        this.setTarget(struct);
                        break;
                    }
                    else
                        crmem.state = 'pickEnergy';
                }

                break;


            case 'moveReclaim':
                // Head back home to reclaim.  But if we got reassigned to a new division,
                // turn back to new target.
                rc = this.actionMoveToRoom(crmem.homeName);
                if(rc != OK)
                    return;
                let spawns = rObj.getSpawns();
                if(spawns && spawns.length > 0){
                    if(spawns[0].pos.getRangeTo(creep.pos) <= 1){
                        spawns[0].recycleCreep(creep);
                        return;
                    }
                    else
                        this.actMoveTo(spawns[0]);
                }
                return;

            default:
                console.log('BUG! Unrecognized creep state='+crmem.state+' for creep='+creep.name);
                crmem.state = 'pickEnergy';
                break;
            }
	    }
	    if(exceed == maxLoop){
	        console.log('BUG! '+creep.name+' exceeded max loops, pos='+creep.pos+'\n'+debug);
	        creep.suicide();
	    }
	}
}

module.exports = Role_Repair;
