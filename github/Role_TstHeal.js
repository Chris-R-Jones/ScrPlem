
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');



// So far, at least, this is a boosted creep only, and tuned accordingly.
const BODY_M1 = [ TOUGH, TOUGH, TOUGH, TOUGH, TOUGH
                , TOUGH, TOUGH, TOUGH, TOUGH, TOUGH
                , HEAL, HEAL, HEAL, HEAL, HEAL
                , HEAL, HEAL, HEAL, HEAL, HEAL
                , HEAL, HEAL, HEAL, HEAL, HEAL
                , HEAL, HEAL, HEAL, HEAL, HEAL
                , HEAL, HEAL, HEAL, HEAL, HEAL
                , HEAL, HEAL, HEAL, HEAL, HEAL
                , MOVE, MOVE, MOVE, MOVE, MOVE
                , MOVE, MOVE, MOVE, MOVE, MOVE
                ];
//   10x10 = 100 TOUGH
// + 30x250 = 7500 WORK
// + 10x50  = 500 MOVE
// = 8100
const BODY_M1_COST = 8100; // ouch


class Role_TstHeal extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, hrObj, targetRoomName, max ) {
        let hRoom           = spawn.room;
        let tRoom           = Game.rooms[targetRoomName];
        let controller      = hRoom.controller;
        let cost;

        // Wait for full energy.
        if(hRoom.energyAvailable < BODY_M1_COST)
            return true;
        let body = BODY_M1;

        // Find a free name and spawn the bot.
        let altTime = 200;
        let multispec = "" ;
        let crname = Creep.spawnCommon(spawn, 'tstHeal', body, max, altTime, multispec, targetRoomName);

        // If null, we hit max creeps.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];
        crmem.tRoomName = targetRoomName;
        crmem.state     = 'init';
        crmem.isBoosted = true;
        delete crmem.instance
        return true;
    };


    // Helper to find lab to boost a certain body part for this creep
    findLabForBoost(crObj, part)
    {
        let boost;
        switch(part){
        case MOVE:
            boost = 'XZHO2';
            break;
        case TOUGH:
            boost = 'XGHO2';
            break;
        case HEAL:
            boost = 'XLHO2';
            break;
        default:
            return null;
        }

        let labs = crObj.getLabs();
        for(let li=0; li<labs.length; li++){
            let lab = labs[li];
            if(   (lab.mineralType == boost)
               && (lab.mineralAmount >= 900)
               && (lab.energy >= 600)
               )
               return lab;
        }

        return null;
    }

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
        let tRoomName;
        let bix;
        let friendlies = crObj.getFriendlies();
        let frCr = null;
	    //tRoomName = division.m_tgtRoomName;



	    //crmem.tRoomName = 'E3N51';
	    //crmem.tRoomName = 'W1S11';
	    //crmem.prevRoom = 'W1NS12';

	    tRoomName = crmem.tRoomName;

        // Heal logic is independent of move logic.  We'll just heal
        // whatever is closest.  (Should probably refine that later).
        let wounded = crObj.getWounded();
        let fCreep = creep.pos.findClosestByRange(wounded);
        let fRange;

        if(fCreep && fCreep.name == creep.name)
            fCreep = null;

        if(fCreep)
            fRange = fCreep.pos.getRangeTo(creep.pos);

        if( (!fCreep && creep.hits < creep.hitsMax)
            || creep.hits < .80*creep.hitsMax){
            creep.heal(creep);
        }
        else if(fCreep && fRange == 1){
            crmem.lastHealTgt = fCreep.id;
            creep.heal(fCreep);
        }
        else if(fCreep && fRange <= 3){
            crmem.lastHealTgt = fCreep.id;
            creep.rangedHeal(fCreep);
        }

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'tstHeal_E6S7_E4S9_0_alt')
            //    console.log('T='+Game.time+' '+creep.name+' state='+crmem.state+' pos='+creep.pos);

            switch(crmem.state){

            case 'init':
                crmem.state = 'checkBoosts';
                return;

            case 'checkBoosts':

                for(bix=0; bix<creep.body.length; bix++){
                    if(creep.body[bix].boost)
                        continue;
                    if(!this.findLabForBoost(crObj,creep.body[bix].type)){
                        console.log('Missing boost for '+creep.body[bix].type);
                        crmem.state = 'moveReclaim';
                        break;
                    }
                }
                crmem.state = 'applyBoosts';

                return;

            case 'applyBoosts':

                for(bix=0; bix<creep.body.length; bix++){
                    if(creep.body[bix].boost)
                        continue;
                    let lab = this.findLabForBoost(crObj,creep.body[bix].type);
                    if(!lab){
                        console.log('Missing boost for '+creep.body[bix].type+' in apply!!');
                        break;
                    }
                    if(creep.pos.getRangeTo(lab)>1)
                        this.actMoveTo(lab);
                    lab.boostCreep(creep);
                    return;
                }
                crmem.state = 'moveTgtRoom';
                break;

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
                if(creep.room.name != tRoomName || !(crmem.prevRoom))
                    crmem.prevRoom = creep.room.name;

                rc = this.actionMoveToRoomRouted(tRoomName);

                if(creep.name == 'tstHeal_E78S91_0'){
                    console.log(' tRoom='+tRoomName+' current='+creep.room.name+' rc='+rc);
                }

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

                // Periodically move to staging to heal retreaters.  But only if we're
                // sitting at entry
                if(true && Math.floor((Math.random()*50)) == 0 && creep.hits == creep.hitsMax
                    && (creep.pos.x == 0 || creep.pos.x == 49 || creep.pos.y == 0 || creep.pos.y == 49)){
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

                // We're idling in the room.  If there's a creep in the
                // room we recently healed, stay near to it.
                if(crmem.lastHealTgt){
                    let fCreep = Game.getObjectById(crmem.lastHealTgt);
                    if(fCreep
                        && fCreep.pos.roomName == creep.pos.roomName
                        && fCreep.pos.getRangeTo(creep.pos)>1
                        ){
                        this.actMoveTo(fCreep)
                    }
                    if(!fCreep)
                        delete crmem.lastHealTgt;
                }
                else {
                    // If we got here, we're just idling, try to find a friendly
                    // tstDecon to guard.
                    friendlies = crObj.getFriendlies();
                    frCr = null;
                    for(let fi=0; fi<friendlies.length; fi++){
                        if(!friendlies[fi] || !friendlies[fi].memory){
                            continue;
                        }
                        if(friendlies[fi].id == creep.id)
                            continue;
                        if(friendlies[fi].memory.role == 'tstGrunt'
                           || friendlies[fi].memory.role == 'tstDecon'
                           ){
                            frCr = friendlies[fi];
                            break;
                        }
                    }
                    if(frCr)
                        this.actMoveTo(frCr);

                }
                return;

            case 'engageTargets':
                // Creeps enter this state if room has wounded.   (That
                // isn't necessarily the case still).
                if(creep.hits < .80 * creep.hitsMax) {
                    if(creep.room.name == crmem.tRoomName)
                        crmem.state = 'moveStaging';
                    //else
                    //    crmem.state = 'moveHome';

                    break;
                }

                // Check if still wounded.  If not move back to the room state
                // for room we're in.
                /*if(!fCreep){
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
                }*/

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
                else {
                    // If we got here, we're just idling, try to find a friendly
                    // tstGrunt to guard.
                    friendlies = crObj.getFriendlies();
                    frCr = null;
    
                    frCr = creep.pos.findClosestByPath(friendlies
                                , { filter: function (cr)
                                    {
                                        return ( cr.memory.role == 'tstGrunt'
                                                || cr.memory.role == 'tstDecon'
                                               );
                                    }
                                }
                                );
                    let rrc=Math.floor(Math.random()*25);
                    
                    if(frCr)
                        this.actMoveTo(frCr);
                    else if(rrc == 0){
                        crmem.state = 'MoveStaging';
                        break;
                    }
                }

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
                crmem.state = 'init';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);
	}
}

module.exports = Role_TstHeal;
