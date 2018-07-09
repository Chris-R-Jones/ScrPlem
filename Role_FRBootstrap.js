
var Preference      = require('Preference');
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// The "first Room" bootstrap is a very special case creep that bootstraps
// the 'Spawn1' for brand new game worlds.  This creep just focuses on bringing
// a room up to controller and extension levels better suited for normal 
// logic. 
//    It's "first room" because ordinarily other rooms would be bootstrapped by
// neighbors capable of better tuned, bigger, creeps.
//   (It's a TBD if I generalize this and share logic, not quite sure yet)


// ---- BODY TYPES AND NOTES ON EFFICIENCY
// Initial body for brand new spawn at controller L1.
// (our only choice really).
// BODY_M1 EFFICIENCY:
//    Takes 25 turns to harvest a source (2 per turn to 50 capacity)
//    Takes 50 turns to upgrade a controller (1 per turn for 50 capacity)
//    + travel, lets say 40 turns on average.
// So they generate control points about 50 each 115 turns (.43 E/turn)
// 
// BODY_M1 SPAWN RATE 
// * without spawn filling:
//   If we don't fill spawn to increase spawn rate, we get 6 creeps live at
//   any time (spawn regenerates 1 per turn, so 1 creep every 250 turns).
//   1500 life / 250 turns = 6 creeps.
//      300 control points each 115 turns  (2.6 E per turn)
//   The long upgrade & move times and with only 6 creeps, we don't keep
//   sources busy.
//
// * with spawn filling:
//   Each creep would take about 345 turns to generate its 150 energy.
//   Theat leaves 1150 turns to generate work.
//   
//   While that is likely to keep all the source spots busy, it's not
//   necessarily generating net energy faster.  Lets say we have 4
//   source harvest spots, constantly busy.  M1 creeps are still only
//   harvesting 4/turn.  More than 2.6 E per turn if we don't boost.
//   But... we are wasting much of that on creep spawning.
//   
//  I've kept it simple with no spawn filling at L1.
const BODY_M1 = [ WORK, CARRY, MOVE, MOVE ];
const BODY_M1_COST = 250;

// BODY_M2
// Analysis for M1 should make it pretty clear the limit is on WORK not
// CARRY, so there's no point upgrading til we can add WORK.
// And as soon as we can, we should, because it does boost productio
// quite a bit:
//
// BODY_M2 EFFICIENCY:
//    Takes 13 turns to harvest a source (4 per turn to 50 capacity)
//    Takes 25 turns to upgrade a controller (2 per turn for 50 capacity)
//    + travel, lets say 40 turns on average.
// So they generate control points about 100 each 78 turns (1.28 E/turn)
// 
// BODY_M2 SPAWN RATE/EFFICIENCY ( no filling )
//    1500 life / 400 turns = 3.75 creeps
//    3.75 creeps * 1.28 E/turn = 4.8 E/turn
//
// That's clearly up from BODY_M1, but 3.75 creeps aren't going to keep 4 source spots
// busy.  It's clear that at level 2, we need to start upping the spawn rate.
// We'll fill spawns/extensions, but set spawn to only spawn if there are free 
// positions adjacent to sources.  
//     math TBD...
const BODY_M2 = [ WORK, WORK, CARRY, MOVE, MOVE, MOVE];
const BODY_M2_COST = 400;


// BODY_M3
//   Add additional carry, as we now spend lest time busy at source, pretty much
// necessary, especially for the longer routes.  This is still possible at L2,
// just a slight upgrade when extensions are built.
const BODY_M3 = [ WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
const BODY_M3_COST = 500;

// BODY_M4
//   M4 comes online as L3 is reached and extensions are built, giving max
// capacity = 800 (300 + 10 extensions).
//   With all of those extensions built, we're ready to shift out of 
// bootstrap mode, to normal dedicated harvesters, so this body is only used
// while building extensions, and beginning to build roads to support level 3.
const BODY_M4 = [ WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
const BODY_M4_COST = 750;


// Repair thresholds.
//
// Low watermark -- we won't actively seek and move to a structure til it is
// below this percent hits.
const REPAIR_LOW_WATERMARK = .50;

// High watermark -- but if we're in the area, and have energy left, we'll
// repair structures below this level.
const REPAIR_HIGH_WATERMARK = .75;


class Role_FRBootstrap extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };
    
    static spawn( spawn ) {
        let room        = spawn.room;
        let controller  = room.controller;
        let body;
        let cost;
        let rObj  = RoomHolder.get(room.name);
        let friendlies = rObj.getFriendlies();
        let exten = rObj.getExtensions();
        
        // Only need these creeps if if spawn is 'Spawn1' and at early control
        // levels, or similarly we're being spawned from a host room that is also very early.
        if( spawn.name != 'Spawn1' && !room.memory.selfBooting )
            return false;
        if(friendlies.length >= 4){
            if(controller.level >= 4 || (controller.level == 3 && exten.length>=10))
                return false;
        }

        // Choose the body we want and will wait for energy for. 
        if(room.energyCapacityAvailable >= BODY_M4_COST){
            body = BODY_M4;
            cost = BODY_M4_COST;
        }
        else if(room.energyCapacityAvailable >= BODY_M3_COST){
            body = BODY_M3;
            cost = BODY_M3_COST;
        }
        else if(room.energyCapacityAvailable >= BODY_M2_COST){
            body = BODY_M2;
            cost = BODY_M2_COST;
        }
        else {
            body = BODY_M1;
            cost = BODY_M1_COST;
        }

        // Wait for it, if not yet available
        if(friendlies.length < 4){
            // Use cheapest for recovery if room looking dead.
            body = BODY_M1;
            cost = BODY_M1_COST;
        }

        if(room.energyAvailable < cost){
            return true;
        }
        
        // Determine max creeps.  Use 2 times the number of source harvest
        // positions for early control levels, but once dediharvs spawn,
        // somewhere around 8.  It clearly makes a big difference how far
        // everything is, but I'm not going to overtune this -- we'll transition
        // soon out of first boot

        let hPos  = rObj.getHarvestPositions();
        let max   = (exten.length >= 8) ?9:hPos.length*2;
        
        if(exten.length == 10){
            if(rObj.getSpawnStorage() != null)
                max = 2;
            else
                max = hPos.length;
        }
        
        // Find a free name and spawn the bot.
        // For first room we'll boot a gazillion of them, so no
        // need for alt names or such.
        let crname = Creep.spawnCommon(spawn, 'frboot', body, max, 0);
        
        // This at least should mean we hit max creeps.
        if(crname == null)
            return false;
        
        let crmem  = Memory.creeps[crname];
        
        // Initialze memory for the role.  Also assign a source position
        // from which to harvest, spreading bootstrappers evenly across the
        // harvest positions, based on their instance number.
        let hp = hPos[crmem.instance % hPos.length];
        crmem.srcX  = hp.source.pos.x;
        crmem.srcY  = hp.source.pos.y;
        crmem.state = 'pickEnergy';
        
        // TBD - we don't need instance number after spawn logic is complete.
        // then again, leave it for now, just in case :)
        // delete crmem.instance
        return true;
    };
    
    
    // Logic callback invoked to have a creep run it's actions - derived from
    // base Creep class (a 'virtual function' or whatever you call it in JS).
	runLogic()
	{
	    let crmem = this.m_crmem;
	    let creep = this.m_creep;
	    let hRoom  = Game.rooms[crmem.homeName];
	    let hrObj  = RoomHolder.get(hRoom.name);
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
	    let debug="";
	    
	    if(creep.room.name != crmem.homeName){
            this.actionMoveToRoomRouted(crmem.homeName);
            return;
        }
	    
	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'frboot_W1N21_2')
            //    console.log(Game.time+' '+creep.name+' state='+crmem.state);

            switch(crmem.state){
                
            case 'pickEnergy':

                // If there are containers (which will typically mean that we
                // are at L3 and they were created by dediharvs), see if we
                // can pickup from containers and leave the work to the dediharvs.
                let containers = hrObj.getContainers();
                if(containers.length){
                    let container = this.m_creep.pos.findClosestByRange
                            (containers
                            ,   { filter: function (st) 
                                    {
                                        return (st.store.energy >= 150);
                                    }
                                }
                            );
                    
                    if(!container && hRoom.storage && hRoom.storage.store.energy >0){
                        this.setTarget(hRoom.storage);
                        crmem.state = 'withdrawStruct';
                        break;
                    }
                    let trm = hrObj.getTerminal();
                    if(!container && trm && trm.store.energy > 0){
                        this.setTarget(trm);
                        crmem.state = 'withdrawStruct';
                        break;
                    }
                    if(container){
                        if(hRoom.storage && hRoom.storage.store.energy >0 && creep.pos.getRangeTo(hRoom.storage) < creep.pos.getRangeTo(container))
                            this.setTarget(hRoom.storage);
                        else
                            this.setTarget(container);
                        crmem.state = 'withdrawStruct';
                        break;
                    }
                }
                
                // Find target source of energy, as designated in spawn logic.
                let sources  = hrObj.getSources();
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
                
            case 'harvestSource':
                rc=this.harvestSource(false);
                if(rc == ERR_FULL){
                    crmem.state = 'pickFill';
                    break;
                }
                if(rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    // targetId is cleared so we do need to re-pick.
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
                    // targetId is cleared so we do need to re-pick.
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
                let spawns = hrObj.getSpawns();

                // Go straight to controller if it's death is imminent
                if(hRoom.controller.ticksToDowngrade < 2000){
                    this.setTarget(hRoom.controller);
                    crmem.state = 'upgradeController';
                    break;
                }
                
                // Don't fill unless we have enough capacity for L3 or higher creeps.
                // or available energy is < 280.  Take advantage of the
                // spawn's own energy generation until we need higher creep counts
                // with more energy, around body m3.
                if(   hRoom.energyCapacityAvailable < BODY_M3_COST
                   && hRoom.energyAvailable < 280
                   ){
                    crmem.state = 'pickBuild';
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
                let extenList = hrObj.getExtensions();
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
                let towerList = hrObj.getTowers();
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
                
                // Otherwise check build.
                crmem.state = 'pickBuild';
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
                let sites = hrObj.getSites();
                let found = false;
                for(si=0; !found && si<sites.length; si++){
                    this.setTarget(sites[si]);
                    found = true;
                }
                if(found){
                    crmem.state = 'buildSite';
                    break;
                }
                
                // Once we begin to build roads (which we need to repair, start
                // watching for repairables).
                if(hRoom.controller.level >= 3){
                    crmem.state = 'pickRepair';
                    break;
                }

                // Otherwise just upgrade controller.
                this.setTarget(hRoom.controller);
                crmem.state = 'upgradeController';
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
                // Check if there are sites to repair - something we begin to
                // need at L3 as we place/build roads.
                let structs = hrObj.getAllStructures();
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
                
                // Otherwise just upgrade controller.
                this.setTarget(hRoom.controller);
                crmem.state = 'upgradeController';
                
                break;

            case 'repairStruct':
                rc=this.repairStruct();
                if( rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES || creep.carry.energy == 0)
                    crmem.state = 'pickEnergy';
                else if(rc == ERR_INVALID_TARGET){
                    let structs = hrObj.getAllStructures();
                    
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
                                    if(st.structureType == STRUCTURE_WALL || st.structureType == STRUCTURE_RAMPART)
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
  
            case 'signController':
                if(hRoom.controller.sign && hRoom.controller.sign.text == Preference.signText){
                    crmem.state = 'upgradeController';
                    break;
                }
                if(hRoom.controller.pos.getRangeTo(creep.pos)>1){
                    this.actMoveTo(hRoom.controller);
                    return;
                }
                console.log('frboot Signing in '+hRoom.name+ 'desired='+Preference.signText);
                creep.signController(hRoom.controller, Preference.signText);
                crmem.state = 'upgradeController';
                return;
                
            case 'upgradeController':
                if(!hRoom.controller.sign
                   || hRoom.controller.sign.text != Preference.signText
                   ){
                    let orig;
                    if(hRoom.controller.sign)
                        orig = hRoom.controller.sign.text;
                    crmem.state = 'signController';
                    break;
                }

                rc=this.upgradeController();
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    crmem.state = 'pickEnergy';
                    break;
                }
                else if(rc == OK)
                    return;
                break;
           
            default:
                console.log('BUG! Unrecognized creep state='+crmem.state+' for creep='+creep.name);
                crmem.state = 'pickEnergy';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);   
	}
}

module.exports = Role_FRBootstrap;
