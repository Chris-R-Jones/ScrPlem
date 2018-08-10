
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Remote bootstrap is a worker focused on bootstrapping a designated room.

const BODY_M4 = [ WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
const BODY_M4_COST = 750;

const BODY_M5 = [ WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
const BODY_M5_COST = 1000;

const BODY_M6 = [ WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
const BODY_M6_COST = 1250;

const BODY_M7 = [ WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
const BODY_M7_COST = 1500;


const BODY_M8 = [ WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
const BODY_M8_COST = 1750;



// Repair thresholds.
//
// Low watermark -- we won't actively seek and move to a structure til it is
// below this percent hits.
const REPAIR_LOW_WATERMARK = .50;

// High watermark -- but if we're in the area, and have energy left, we'll
// repair structures below this level.
const REPAIR_HIGH_WATERMARK = .75;


class Role_RemoteBootstrap extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, spObj, targetRoomName, maxCreep ) {
        let room        = spawn.room;
        let controller  = room.controller;
        let body;
        let cost;

        // Choose the body we want and will wait for energy for.

        if(room.energyCapacityAvailable >= BODY_M8_COST){
            body = BODY_M8;
            cost = BODY_M8_COST;
        }
        else if(room.energyCapacityAvailable >= BODY_M7_COST){
            body = BODY_M7;
            cost = BODY_M7_COST;
        }
        else if(room.energyCapacityAvailable >= BODY_M6_COST){
            body = BODY_M6;
            cost = BODY_M6_COST;
        }
        else if(room.energyCapacityAvailable >= BODY_M5_COST){
            body = BODY_M5;
            cost = BODY_M5_COST;
        }
        else if(room.energyCapacityAvailable >= BODY_M4_COST){
            body = BODY_M4;
            cost = BODY_M4_COST;
        }
        else
            return false;

        // Wait for it, if not yet available
        if(room.energyAvailable < cost)
            return true;

        // Determine max creeps.
        let trObj  = RoomHolder.get(targetRoomName);
        let multispec = "";
        let altlife = 300;

        // Find a free name and spawn the bot.
        // For first room we'll boot a gazillion of them, so no
        // need for alt names or such.
        let crname = Creep.spawnCommon(spawn, 'remoteBoot', body, maxCreep, altlife, multispec, targetRoomName);

        // This at least should mean we hit max creeps.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];

        // Initialze memory for the role.  Also assign a source
        // from which to harvest, spreading bootstrappers evenly across the
        // sources, based on their instance number.
        //   Note that unlike the 'first room' bootstrap we just rotate sources
        // not harvest positions.  These bootstraps are pretty big, so it's
        // more a matter of keeping the source busy while we carry, not really
        // where the position we harvest from.
        let sources = trObj.getSources();
        let source = sources[crmem.instance % sources.length];
        crmem.tRoomName = targetRoomName;
        crmem.srcX  = source.pos.x;
        crmem.srcY  = source.pos.y;
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
	    let rObj   = RoomHolder.get(creep.room.name);
	    let tRoom  = Game.rooms[crmem.tRoomName];
	    let trObj  = RoomHolder.get(tRoom.name);
	    let rc;
	    let maxLoop = 6;
	    let exceed;
	    let si;
	    let debug="";

	    // Defence.. tbd to move into common logic
	    if( rObj.m_rmem.hostileCt > 0 || trObj.m_rmem.hostileCt > 0 ){
	        // Remote bootstrap defence is a little different than most.
	        // In most cases we happened upon a hostile sector.  Something
	        // routing probably should have avoided, but it's better to
	        // run through than to keep bouncing back toward home (possibly very far away)
	        // and the hostile sector we'll just get routed to again.
	        let hRoom = Game.rooms[crmem.homeName];
	        let hrObj = RoomHolder.get(crmem.homeName);

	        if (rObj.m_room.name == crmem.tRoomName){
	            // If we are at target, it's hostile, so we actually do want to
	            // retreat home here.
	            this.actionMoveToRoomRouted(crmem.homeName);
                if(crmem.state != 'moveTargetRoom'){
        	        this.clearTarget();
        	        crmem.state = 'moveTargetRoom';
                }
	        }
	        else {
	            // We aren't to target yet and are in a hostile room, or
	            // we are headed to a hostile target.  Either way, keep on
	            // truckin.
                this.actionMoveToRoomRouted(crmem.tRoomName);
                if(crmem.state != 'moveTargetRoom'){
        	        this.clearTarget();
        	        crmem.state = 'moveTargetRoom';
                }
                return;
	        }

	        return;
	    }

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            if(creep.name == 'remoteBoot_E78S97_E74S91_4_alt')
                console.log(Game.time+': '+creep.name+' DBG state='+crmem.state+' mrpath='+crmem.mrpath);

            switch(crmem.state){

            case 'moveTargetRoom':
                if(this.actionMoveToRoomRouted(crmem.tRoomName) == OK){
                    crmem.state = 'pickEnergy';
                    break;
                }
                return;

            case 'pickEnergy':
                if(creep.room.name != crmem.tRoomName){
                    crmem.state = 'moveTargetRoom';
                    break;
                }

                if(tRoom.storage){
                    if(tRoom.storage.store.energy > 0){
                        this.setTarget(tRoom.storage);
                        crmem.state = 'withdrawStruct';
                        break;
                    }

                    // There could be a 'stolen' storage container.  If we've drained it, destroy it.
                    else if(!tRoom.storage.my && _.sum(tRoom.storage.store) == 0)
                        tRoom.storage.destroy();
                }

                // If there are containers (which will typically mean that we
                // are at L3 and they were created by dediharvs), see if we
                // can pickup from containers and leave the work to the dediharvs.
                let containers = trObj.getContainers();
                if(containers.length){
                    let container = this.m_creep.pos.findClosestByRange
                            (containers
                            ,   { filter: function (st)
                                    {
                                        return (st.store.energy >= 150);
                                    }
                                }
                            );

                    if(!container & tRoom.storage){
                        this.setTarget(tRoom.storage);
                        crmem.state = 'withdrawStruct';
                        break;
                    }
                    if(container){
                        if(tRoom.storage && creep.pos.getRangeTo(tRoom.storage) < creep.pos.getRangeTo(container))
                            this.setTarget(tRoom.storage);
                        else
                            this.setTarget(container);
                        crmem.state = 'withdrawStruct';
                        break;
                    }
                }

                // If there are dropped resources within range 6 of storage,
                // then go get it.
                let dropped = trObj.getDroppedResources();
                if(dropped && dropped.length > 0){
                    let di;
                    let drop;
                    for(di=0; di<dropped.length; di++){
                        drop = dropped[di];
                        if(drop.resourceType == RESOURCE_ENERGY){
                            this.setTarget(drop);
                            crmem.state = 'getDropped';
                            break;
                        }
                    }
                    if(di != dropped.length)
                        break;
                }

                // Find target source of energy, as designated in spawn logic.
                let sources  = trObj.getSources();
                let best;

                for(si=0; si<sources.length; si++){
                    if(sources[si].pos.x == crmem.srcX
                       && sources[si].pos.y == crmem.srcY)
                    {
                       best = sources[si];
                       break;
                    }
                }
                if(!best){
                    console.log('BUG! No source at designated source position x='+crmem.srcX+' y='+crmem.srcY);
                    return;
                }
                this.setTarget(best);
                crmem.state = 'harvestSource';
                break;

            case 'getDropped':
                rc=this.pickupDropped(RESOURCE_ENERGY);
                if(rc == ERR_FULL){
                    crmem.state = 'pickFill';
                    break;
                }
                if(rc == OK)
                    return;
                crmem.state = 'pickEnergy';
                if(rc == ERR_NOT_ENOUGH_RESOURCES || rc == ERR_NO_PATH)
                    return;
                break;

            case 'harvestSource':
                rc=this.harvestSource(false);
                if(rc == ERR_FULL){
                    crmem.state = 'pickFill';
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
                console.log(creep.name+' harvestSource rc='+rc);
                crmem.state = 'pickEnergy';
                return;

            case 'withdrawStruct':
                rc=this.withdrawStruct(RESOURCE_ENERGY);
                if(rc == ERR_FULL){
                    crmem.state = 'pickFill';
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

            case 'pickFill':
                let spawns = trObj.getSpawns();

                // Go straight to controller if it's death is imminent
                if(tRoom.controller.ticksToDowngrade < 2000){
                    this.setTarget(tRoom.controller);
                    crmem.state = 'upgradeController';
                    break;
                }

                // Check if spawn needs a fill
                // Really we'll only have 1 spawn with bootstrap, so this be overkill,
                // but just in case someone inherits this code...
                for(si=0; si<spawns.length; si++){
                    if(spawns[si].energy < spawns[si].energyCapacity){
                        this.setTarget(spawns[si]);
                        break;
                    }
                }
                if(si != spawns.length){
                    crmem.state = 'fillStructure';
                    break;
                }

                // Check if any extensions need a fill
                let extenList = trObj.getExtensions();
                let ei;
                let exten;
                exten = creep.pos.findClosestByPath
                        (extenList
                        ,   { filter: function (st)
                                {
                                    return (st.energy < st.energyCapacity);
                                }
                            }
                        );
                if(exten){
                    this.setTarget(exten);
                    crmem.state = 'fillStructure';
                    break;
                }

                // Check towers too
                let towerList = trObj.getTowers();
                let ti;
                let tower;
                for(ti=0; ti<towerList.length; ti++){
                    tower = towerList[ti];
                    if(tower.energy < tower.energyCapacity){
                        this.setTarget(tower);
                        break;
                    }
                }
                if(ti != towerList.length){
                    crmem.state = 'fillStructure';
                    break;
                }

                // Otherwise check if there is stuff to repair, or if not
                // to build.
                crmem.state = 'pickRepair';
                break;

            case 'fillStructure':
                rc=this.fillTarget(RESOURCE_ENERGY);
                if(rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    crmem.state = 'pickEnergy';
                    break;
                }
                if(creep.carry.energy < 50){
                    crmem.state = 'pickEnergy';
                    break;
                }
                crmem.state = 'pickFill';
                break;

            case 'pickBuild':
                // Check if there are sites to be built, and build.  RoomPlanner
                // places these and prioritizes for growth. So any site we find.
                let sites = trObj.getSites();
                let site = creep.pos.findClosestByPath(sites);
                if(site){
                    this.setTarget(site);
                    crmem.state = 'buildSite';
                    break;
                }

                // Otherwise just upgrade controller.
                this.setTarget(tRoom.controller);
                crmem.state = 'upgradeController';
                break;

            case 'buildSite':
                rc=this.buildSite();
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
                // Check if there are sites to repair - something we begin to
                // need at L3 as we place/build roads.
                //   Skip this when recovering L6+ rooms, which can do better to
                // repair themselves once we build basic structures
                // (spawns, extensions)
                if(!(trObj.m_room.controller) || trObj.m_room.controller.level < 6){
                    let structs = trObj.getAllStructures();
                    let struct;
                    for(si=0; structs && si<structs.length; si++){
                        // Only go for structures that hit a certain low threshold.
                        struct = structs[si];
                        if(struct.structureType == STRUCTURE_WALL || struct.structureType == STRUCTURE_RAMPART)
                            continue;
                        if(struct.hits < (REPAIR_LOW_WATERMARK * struct.hitsMax))
                            break;
                    }
                    if(structs && si != structs.length){
                        this.setTarget(struct);
                        crmem.state = 'repairStruct';
                        break;
                    }
                }

                // Otherwise check for new building
                crmem.state = 'pickBuild';

                break;

            case 'repairStruct':
                rc=this.repairStruct();
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
                                    if(st.structureType == STRUCTURE_WALL
                                       || st.structureType == STRUCTURE_RAMPART
                                       || st.structureType == STRUCTURE_CONTROLLER
                                       )
                                        return false;
                                    return (st.hits <= (REPAIR_HIGH_WATERMARK * st.hitsMax));
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
                else
                    console.log('repairStruct rc='+rc);

                break;

            case 'upgradeController':
                rc=this.upgradeController();
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    crmem.state = 'pickEnergy';
                    break;
                }
                if(rc == OK)
                    return;
                crmem.state = 'pickEnergy';
                return;

            default:
                console.log('BUG! Unrecognized creep state='+crmem.state+' for creep='+creep.name);
                crmem.state = 'pickEnergy';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' pos='+creep.pos+' exceeded max loops\n'+debug);
	}
}

module.exports = Role_RemoteBootstrap;
