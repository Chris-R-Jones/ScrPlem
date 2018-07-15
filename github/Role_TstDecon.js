var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Mil decon is a boosted WORK focused military creep that focuses on cracking
// walls and ultimately cleaning the target room of structures.
//  It is a squad focused creep and will generally try to focus on squad-designated
// locations and targets

// So far, at least, this is a boosted creep only, and tuned accordingly.
const BODY_M1 = [ TOUGH, TOUGH, TOUGH, TOUGH, TOUGH
                , TOUGH, TOUGH, TOUGH, TOUGH, TOUGH
                , WORK, WORK, WORK, WORK, WORK
                , WORK, WORK, WORK, WORK, WORK
                , WORK, WORK, WORK, WORK, WORK
                , WORK, WORK, WORK, WORK, WORK
                , WORK, WORK, WORK, WORK, WORK
                , WORK, WORK, WORK, WORK, WORK
                , MOVE, MOVE, MOVE, MOVE, MOVE
                , MOVE, MOVE, MOVE, MOVE, MOVE
                ];
//   10x10 = 100 TOUGH
// + 30x100 = 3000 WORK
// + 10x50  = 500 MOVE
// = 3600
const BODY_M1_COST = 3600;


const MAX_SQUAD_RANGE = 5;

class Role_TstDecon extends Creep
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
        let body;

        // Wait for full energy.
        if(hRoom.energyAvailable < BODY_M1_COST)
            return true;
        body = BODY_M1;

        // Find a free name and spawn the bot.
        let altTime = 200;
        let multispec = "" ;
        let crname = Creep.spawnCommon(spawn, 'tstDecon', body, max, altTime, multispec, targetRoomName);

        // If null, we hit max creeps.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];
        crmem.tRoomName  = targetRoomName;
        crmem.state     = 'init';
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
        case WORK:
            boost = 'XZH2O';
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
	    let didDismantle=false;
	    let tRoomName;
	    let bix;

	    //crmem.tRoomName = 'E3N51';
	    //crmem.prevRoom = 'W3N40';

	    tRoomName = crmem.tRoomName;

	    // Always dismantle any adjacent structure if in target room.
	    if(creep.room.name == tRoomName){
	        structs = crObj.getAllStructures();
	        closest = creep.pos.findClosestByRange
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

            //if(creep.name == 'tstDecon_W1N21_E1N23_0')
            //  console.log(Game.time+': '+creep.name+'pos='+ creep.pos+' loop'+exceed+' state='+crmem.state);

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
                        return;
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
                        return;
                    }
                    if(creep.pos.getRangeTo(lab)>1)
                        this.actMoveTo(lab);
                    lab.boostCreep(creep);
                    return;
                }
                crmem.state = 'moveTgtRoom';

                break;

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
                if(creep.hits < (.80*creep.hitsMax)){
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
                if(creep.hits < (.80 * creep.hitsMax)){
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

                if(creep.room.name != tRoomName){
                    console.log(creep.name+' '+creep.pos+' BUG! pickDecon state in wrong room!');
                    crmem.state = 'moveTgtRoom';
                    break;
                }


                // Make sure we're reasonably close to a friendly healer.
                // They 'should' bubble along side us in a mass chaos fashion.
                // Make sure we're reasonably close to a friendly healer.
                // They 'should' bubble along side us in a mass chaos fashion.
                let friendlies = crObj.getFriendlies();
                let frCr = null;
                let minDist = 99;
                for(let fi=0; fi<friendlies.length; fi++){
                    if(!friendlies[fi] || !friendlies[fi].memory){
                        continue;
                    }
                    if(friendlies[fi].id == creep.id){
                        continue;
                    }
                    if(friendlies[fi].memory.role == 'tstHeal'){
                        let dist = friendlies[fi].pos.getRangeTo(creep);
                        if(dist < minDist){
                            frCr = friendlies[fi];
                            minDist = dist;
                        }
                        frCr = friendlies[fi];
                    }
                }
                
                if(!frCr || creep.hits < ((3*creep.hitsMax)/5)){
                    crmem.state = 'moveStaging';
                    return;
                }
                else if(frCr && creep.hits < creep.hitsMax && minDist >= 2){
                    this.actMoveTo(frCr);
                    return;
                }
                else if(frCr && minDist >= 3){
                    this.actMoveTo(frCr);
                    return;
                }

                // Otherwise, pick highest priority decon target and move on it.
                let best;
                let bestVal;
                let si;
                
                best = Game.getObjectById('5b33adc124fa395a7f088103');
                if(!best) best = Game.getObjectById('5b33adafd98bcc05a75e371a');
                if(!best) best = Game.getObjectById('5b33adafd98bcc05a75e371a');
                
                if(!best) best = Game.getObjectById('5a4179248e4f37363d356899');
                if(!best) best = Game.getObjectById('5a1d7a34e15dde2fafc7464d');
                if(!best) best = Game.getObjectById('5a41624ffb6fcf651dfb9b5d');
                    
                if(!best){
                    
                    for(si=0; si<structs.length; si++){
                        let struct = structs[si];
                        let priority;
                        let range = struct.pos.getRangeTo(creep.pos);
    
                        switch(struct.structureType){
                            case STRUCTURE_TOWER:
                                priority = 100;
                                break;
                            case STRUCTURE_LAB:
                                priority = 95;
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
                            case STRUCTURE_STORAGE:
                                /*priority = 89;
                                break;*/
                                continue;
                            case STRUCTURE_TERMINAL:
                                //priority = 88;
                                continue;
                            case STRUCTURE_CONTROLLER:
                                continue;
                            default:
                                priority = 10;
                        }
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
                    rc=this.actMoveTo(best, { ignoreDestructibleStructures: false, maxRooms: 1} );
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

module.exports = Role_TstDecon;
