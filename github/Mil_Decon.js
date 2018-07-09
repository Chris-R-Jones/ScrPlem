
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Mil decon is a WORK focused military creep that focuses on wiping clean a room of all structures.
// It prioritizes towers, and walls in its path on way to them, then cleans other structures, leaving storage
// for looting.

// It enters target room cautiously, retreating toward home room when damaged.

class Mil_Decon extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };
    
    static spawn( spawn, hrObj, division, max ) {
        let targetRoomName  = division.m_tgtRoomName;          
        let hRoom           = spawn.room;
        let tRoom           = Game.rooms[targetRoomName];
        let controller      = hRoom.controller;
        let cost;
        
        // Body will be equal TOUGH/WORK/WORK/MOVE/MOVE/MOVE.
        let nUnit = Math.floor(hRoom.energyCapacityAvailable / 360);
        let body = [];
        let ni;
        
        // Wait for biggest creep we can
        if(hRoom.energyAvailable < (nUnit * 360) )
            return true;
        
        if(nUnit*6 > 50)
            nUnit = 8;          // Obey 50 part body limit
                
        for(ni=0; ni<nUnit; ni++)
            body.push(TOUGH);
        
        for(ni=0; ni<2*nUnit; ni++)
            body.push(WORK);
        
        for(ni=0; ni<((3*nUnit)); ni++)
            body.push(MOVE);
        
        // Find a free name and spawn the bot.
        let altTime = 0;
        let multispec = "" ;
        let crname = Creep.spawnCommon(spawn, 'milDecon', body, max, altTime, multispec, targetRoomName);
        
        // If null, we hit max creeps.
        if(crname == null)
            return false;
        
        let crmem  = Memory.creeps[crname];
        crmem.division  = targetRoomName;
        crmem.state     = 'moveTgtRoom';
        delete crmem.instance
        return true;
    };
    
    
    // Logic callback invoked to have a creep run it's actions - derived from
    // base Creep class (a 'virtual function' or whatever you call it in JS).
	runLogic()
	{
	    let crmem = this.m_crmem;
	    let creep = this.m_creep;
	    let cRoom  = creep.room;
	    let crObj  = RoomHolder.get(cRoom.name);
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
	    let structs;
	    let closest;
	    let debug="";
	    let didDismantle=false;
	    let squad = this.m_squad;
	    let division;
        let tRoomName;
        
        // Manual override
        if(false && creep.name == 'milDecon_E9S16_E8S12_0'){
            //RoomHolder.get('E8S12');
            //his.actionMoveToRoomRouted('E8S12');
            let tgt = Game.getObjectById('59f4574876768c0f7169cc96');
            if(!tgt)
                tgt = Game.getObjectById('59f462746549925666bbd9b8');
            if(creep.pos.getRangeTo(tgt)>1)
                this.actMoveTo(tgt);
            else if(creep.pos.getRangeTo(tgt)==0)
                creep.move(TOP);
            let rc = creep.dismantle(tgt);
            console.log('disman rc='+rc);
            return;
        }
        
	    if(squad)
	        division = squad.m_division;
	    if(!squad){
	        // I think this case happens when a division stands down while a
	        // creep is spawning.  It's no longer needed.  Better would be
	        // to search for new assignments.  First I need to understand
	        // where this is coming from to confirm.  Some debug and attempt
	        // to reclaim, but perhaps this is temporary.
	        // NOTE! Also check the omni, healer and decon equivalents.
	        console.log(creep.name+'WhAT!? No squad?! squadName='+crmem.squad+' TTL='+creep.ticksToLive
	                   +' division='+crmem.division);
	        let spawn=creep.pos.findClosestByRange(FIND_MY_SPAWNS);
	        if(spawn){
	            if(creep.pos.getRangeTo(spawn) > 1)
	                this.actMoveTo(spawn);
	            else
	                spawn.recycleCreep(creep);
	        }
	        return;
	    }
	    if(squad && !division) {
            // Squad must be in reserves.
	        crmem.state = 'moveReclaim';
	    }
        if(squad && division)
	        tRoomName = division.m_tgtRoomName;

	    
	    // Always dismantle any adjacent structure if in target room.
	    if(creep.room.name == tRoomName){
	        structs = crObj.getAllStructures();
	        closest = creep.pos.findClosestByPath
	                    (structs
                        ,   { filter: function (st) 
                                {
                                    return ( ( st.structureType != STRUCTURE_STORAGE || _.sum(st.store) == 0)
                                            && ( st.structureType != STRUCTURE_CONTAINER || _.sum(st.store) == 0)
                                            && st.structureType != STRUCTURE_CONTROLLER
                                            );
                                }
                            }
	                    );
	        if(creep.pos.getRangeTo(closest)<=1){
	            rc=creep.dismantle(closest);
	            //console.log(creep.name+' Dismantle '+closest+' rc='+rc+' hits='+closest.hits);
	            didDismantle=true;
            }
	    }
        // Always heal ourselves.  Otherwise state machine is mostly movement
        // logic.
        if(!didDismantle || (didDismantle && creep.hits <  .80*creep.hitsMax))
            creep.heal(creep);

	    
	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'milDecon_E75S97_E72S97_0')
            //    console.log(creep.name+' loop'+exceed+' state='+crmem.state);
            
            switch(crmem.state){

            case 'moveHome':
                if(creep.hits == creep.hitsMax){
                    crmem.state = 'moveTgtRoom';
                    break;
                }
                rc = this.actionMoveToRoomRouted(crmem.homeName);
                if(rc == OK) {
                    crmem.state = 'homeHeal'
                    break;
                }
                return;

            case 'homeHeal':
                if(creep.hits == creep.hitsMax)
                    crmem.state = 'moveTgtRoom';
                else {
                    // Try to stay out of arrival lane so arriving wounded
                    // creeps don't bounce
                    if(creep.pos.x==1)
                        creep.move(RIGHT);
                    else if(creep.pos.x==48)
                        creep.move(LEFT);
                    else if(creep.pos.y==1){
                        switch(Math.floor((Math.random() * 3))){
                        case 0: creep.move(BOTTOM); break;
                        case 1: creep.move(BOTTOM_RIGHT); break;
                        case 2: creep.move(BOTTOM_LEFT); break;
                        }
                    }
                    else if(creep.pos.y==48)
                        creep.move(TOP);
                }    
                
                
                return;

            case 'moveTgtRoom':
                delete crmem.arrivalT;
                
                // Ensure we're fully healed, move to target room.
                if(creep.hits < .80*creep.hitsMax){
                    crmem.state = 'moveStaging';
                    break;
                }

                // When moving to target room, determine the room we entered it from,
                // for retreat.
                if(creep.room.name != tRoomName)
                    crmem.prevRoom = creep.room.name;

                rc = this.actionMoveToRoomRouted(tRoomName);
                if(rc == OK) {
                    crmem.state = 'hostileArrival'
                    break;
                }
                return;

            case 'hostileArrival':
                // Reset hostile room arrival time, then linger at arrival.
                crmem.arrivalT = Game.time;
                crmem.state = 'lingerTgtRoom';
                break;
            
            case 'lingerTgtRoom':
                // On arriving in a hostile room, we need to linger a while and see if we're getting
                // pinged with towers.  If so, healers need to take care of this primarily, so we
                // return to home room to heal.
                if(!crmem.arrivalT)
                    crmem.arrivalT = Game.time;
               
                // If not, and we're wounded, move back home where we can
                // get healing.
                if(creep.hits < .80 * creep.hitsMax){
                    crmem.state = 'moveStaging';
                    break;
                }
                
                //console.log('ArrivalT='+crmem.arrivalT +' now='+Game.time);
                if( (Game.time - crmem.arrivalT) >= 10 ) {
                    crmem.state = 'pickDecon';
                    break;
                }
                return;
            
            case 'moveStaging':
                rc = this.actionMoveToRoom(crmem.prevRoom);
                if(rc == OK)
                    crmem.state = 'stagingRoom';
                return;
                
            case 'stagingRoom':
                if(creep.room.name != crmem.prevRoom){
                    crmem.state = 'moveStaging';
                    break;
                }

                if(creep.hits == creep.hitsMax){
                    crmem.state = 'moveTgtRoom';
                    break;
                }
                // If there's room, move out of  arrivals.
                if(creep.pos.x==1)
                    creep.move(RIGHT);
                else if(creep.pos.x>46){
                    switch(Math.floor((Math.random() * 3))){
                    case 0: creep.move(BOTTOM_LEFT); break;
                    case 1: creep.move(TOP_LEFT); break;
                    case 2: creep.move(LEFT); break;
                    }
                }
                else if(creep.pos.y<3){
                    switch(Math.floor((Math.random() * 3))){
                    case 0: creep.move(BOTTOM); break;
                    case 1: creep.move(BOTTOM_RIGHT); break;
                    case 2: creep.move(BOTTOM_LEFT); break;
                    }
                }
                else if(creep.pos.y==48)
                    creep.move(TOP);    
                
                //if(creep.hits < .60 * creep.hitsMax){
                //    crmem.state = 'moveHome';
                //    break;
                //}
                return;
    
            case 'pickDecon':
                // If we're starting to get hit move home for heals.
                if(creep.hits != creep.hitsMax){
                    crmem.state = 'moveStaging';
                    break;
                }
                if(creep.room.name != tRoomName){
                    //console.log(creep.name+' pos='+creep.pos+' BUG! pickDecon state in wrong room!');
                    crmem.state = 'moveTgtRoom';
                    break;
                }
                // Otherwise, pick highest priority decon target and move on it.
                let best;
                let bestVal;

                
                let si;
                for(si=0; si<structs.length; si++){
                    let struct = structs[si];
                    let priority;
                    let range = struct.pos.getRangeTo(creep.pos);
                
                    switch(struct.structureType){
                        case STRUCTURE_TOWER:
                            priority = 100;
                            break;
                        case STRUCTURE_SPAWN:
                            priority = 90;
                            break;
                        case STRUCTURE_EXTENSION:
                            priority = 80;
                            break;
                        case STRUCTURE_WALL:
                            priority = 2;
                            break;
                        case STRUCTURE_ROAD:
                            priority = 3;
                            break;
                        case STRUCTURE_RAMPART:
                            priority = 1;
                            break;
                        case STRUCTURE_CONTAINER:
                            priority = 1;
                            break;
                        case STRUCTURE_POWER_BANK:
                            break;
                        case STRUCTURE_STORAGE:
                            /*priority = 1;
                            break;
                            */
                            continue;
                        case STRUCTURE_TERMINAL:
                            /*priority = 1;
                            break;
                            */
                            continue;
                        case STRUCTURE_CONTROLLER:
                            continue;
                        default:
                            priority = 10;
                    }
                    
                    let score = (priority * 10000000) + (100-range)*10000 + (100000-struct.hits);
                    if(!bestVal || score > bestVal){
                        bestVal = score;
                        best = struct;
                    }
                }
                
                if(!best) {
                    let sites = crObj.getSites();
                    if(sites.length)
                        this.actMoveTo(sites[0]);
                    return;
                }
                if(best.pos.getRangeTo(creep.pos) >= 2)
                    rc=this.actMoveTo(best, { ignoreDestructibleStructures: true, maxRooms: 1} );
                else
                    rc=creep.dismantle(best);
                return;

            
            case 'moveReclaim':
                // Head back home to reclaim.  But if target room went hostile again,
                // turn back.
                let trObj = RoomHolder.get(tRoomName);
                if(trObj && trObj.m_rmem.hostileCt){
                    crmem.state = 'moveTgtRoom';
                    break;
                }
                
                rc = this.actionMoveToRoomRouted(crmem.homeName);
                if(rc != OK)
                    return;
                let spawns = crObj.getSpawns();
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
                crmem.state = 'moveTgtRoom';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);   
	}
}

module.exports = Mil_Decon;
