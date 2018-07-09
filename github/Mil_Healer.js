
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Mil healer is a creep that just goes around healing friendlies.  It'll bounce between home and target
// sectors, healing friendlies in either (preferring the target).
//   They are also built with toughness to perform a drain role, lasting in target sector as much as they can.

class Mil_Healer extends Creep
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

        // HEAL=250
        // TOUGH=10
        //
        // so a core of:
        //   N x [ TOUGH, HEAL, MOVE, MOVE ]
        //     = (N x 360)
        let coreCost = 360;
        let nCore = Math.floor(hRoom.energyCapacityAvailable / coreCost);
        let body = [];
        let ni;
        
        if( hRoom.energyAvailable < (nCore*coreCost))
            return true;
        
        if(nCore*4 > 50)
            nCore = 12;          // Obey 50 part body limit
        
        for(ni=0; ni<nCore; ni++)
            body.push(TOUGH);
        
        for(ni=0; ni<nCore; ni++)
            body.push(HEAL);

        for(ni=0; ni<(2*nCore); ni++)
            body.push(MOVE);
        
        // Find a free name and spawn the bot.
        let altTime = 0;
        let multispec = "" ;
        let crname = Creep.spawnCommon(spawn, 'milHeal', body, max, altTime, multispec, targetRoomName);
        
        // If null, we hit max creeps.
        if(crname == null)
            return false;
        
        let crmem  = Memory.creeps[crname];
        crmem.division  = targetRoomName;
        crmem.state     = 'homeRoom';
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
	    let squad = this.m_squad;
	    let division;
        let tRoomName;
        
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
	    
        // Heal logic is independent of move logic.  We'll just heal
        // whatever is closest.  (Should probably refine that later).
        let friendlies = crObj.getWounded();
        let fCreep = creep.pos.findClosestByRange(friendlies);
        let fRange;
        
        if(fCreep && fCreep.name == creep.name)
            fCreep = null;
        
        if(fCreep)
            fRange = fCreep.pos.getRangeTo(creep.pos);
        if( (!fCreep && creep.hits < creep.hitsMax)
            || creep.hits < .80*creep.hitsMax){
            creep.heal(creep);
        }
        else if(fCreep && fRange == 1)
            creep.heal(fCreep);
        else if(fCreep && fRange <= 3)
            creep.rangedHeal(fCreep);

        
	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';
    
            //if(creep.name == 'milHeal_E78S98_E73S97_0')
            //    console.log('T='+Game.time+' '+creep.name+' state='+crmem.state);

            switch(crmem.state){

            case 'homeRoom':
                // When in home room, there's no point moving to target
                // if home room is also wounded.  If there are
                // targets, find and engage.
                if(fCreep)
                    crmem.state = 'engageTargets';
                else if(creep.hits < creep.hitsMax)
                    // Lurk here til we get some self healing
                    return;
                else{
                    crmem.state = 'moveTgtRoom';
                      break;
                }
                return;
                
            case 'moveHome':
                if(creep.hits == creep.hitsMax){
                    crmem.state = 'moveTgtRoom';
                    break;
                }
                rc = this.actionMoveToRoomRouted(crmem.homeName);
                if(rc == OK) {
                    crmem.state = 'homeRoom'
                    break;
                }
                return;

            case 'moveTgtRoom':
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
            
            case 'moveStaging':
                rc = this.actionMoveToRoomRouted(crmem.prevRoom);
                if(rc == OK)
                    crmem.state = 'stagingRoom';
                return;
                
            case 'stagingRoom':
                // If there are wounded, start getting to work.
                if(fCreep){
                    crmem.state = 'engageTargets';
                    break;
                }                
                //if(creep.hits < .60 * creep.hitsMax){
                //    crmem.state = 'moveHome';
                //    break;
                //}
                if(creep.hits == creep.hitsMax)
                    crmem.state = 'moveTgtRoom';
                return;
                
            case 'lingerTgtRoom':
                if(creep.room.name != tRoomName){
                    console.log('BUG!! not in target room but lingerTgtRoom');
                    crmem.state = 'moveTgtRoom';
                }
                
                // Periodically move to staging to heal retreaters, if still in entry.
                if(Math.floor((Math.random()*50)) == 0 && creep.hits == creep.hitsMax
                   && (creep.pos.x == 0 || creep.pos.x == 49 || creep.pos.y == 0 || creep.pos.y == 49)){
                    crmem.state = 'moveStaging';
                    break;
                }
                
                // If there are wounded, start getting to work.
                if(fCreep){
                    crmem.state = 'engageTargets';
                    break;
                }
                
                // If not, and we're wounded, move back home where we can
                // get healing.
                if(creep.hits < .80 * creep.hitsMax){
                    crmem.state = 'moveStaging';
                    break;
                }
                
                // If there's room, move out of  arrivals.
                if(creep.pos.x==1){
                    switch(Math.floor((Math.random() * 3))){
                    case 0: creep.move(BOTTOM_RIGHT); break;
                    case 1: creep.move(TOP_RIGHT); break;
                    case 2: creep.move(RIGHT); break;
                    }
                }    
                else if(creep.pos.x>47){
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
                return;
            
            case 'engageTargets':
                // Creeps enter this state if room has wounded.   (That
                // isn't necessarily the case still).
                if(creep.hits < .80 * creep.hitsMax) {
                    if(creep.room.name == crmem.tRoomName)
                        crmem.state = 'moveStaging';
                    break;
                }
                
                // Check if still wounded.  If not move back to the room state
                // for room we're in.
                if(!fCreep){
                    if(creep.room.name == crmem.homeName){
                        crmem.state = 'homeRoom';
                        break;
                    }
                    else if(creep.room.name == tRoomName){
                        crmem.state = 'lingerTgtRoom'; 
                        break;
                    } 
                    else{
                        crmem.state = 'stagingRoom';
                        break;
                    }
                }
                
                // Try to stay out of arrival lane so arriving wounded
                // creeps don't bounce
                if(fCreep && creep.pos.getRangeTo(fCreep)>3){
                    this.actMoveTo(fCreep);
                }
                else if(creep.pos.x==1){
                    switch(Math.floor((Math.random() * 3))){
                    case 0: creep.move(BOTTOM_RIGHT); break;
                    case 1: creep.move(TOP_RIGHT); break;
                    case 2: creep.move(RIGHT); break;
                    }
                }    
                else if(creep.pos.x>47){
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
                else if(fCreep && creep.pos.getRangeTo(fCreep)>1)
                    this.actMoveTo(fCreep);
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
                crmem.state = 'moveHome';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);   
	}
}

module.exports = Mil_Healer;
