
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Mil omni is a multi-focus creep intended as the main reaction creep for most light invader threats.
// It packs a little attack, ranged and toughness, to balance typical invaders.  I decided not
// to include heal here.  The creep is near home and can get tower heals if it needs it, and
// heal plus attack doesn't stack, so there's no real point in battle.   If heal is needed, it should
// find a support creep :)
//
// For tougher invader threats, we'll need more stacking of omnis and/or heal friends.


const BODY_CL8 = [ TOUGH, TOUGH, TOUGH, TOUGH, TOUGH
               , ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
               , ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
               , RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK
               , RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK
               , MOVE, MOVE, MOVE, MOVE, MOVE
               , MOVE, MOVE, MOVE, MOVE, MOVE
               , MOVE, MOVE, MOVE, MOVE, MOVE
               , MOVE, MOVE, MOVE, MOVE, MOVE
               , MOVE, MOVE, MOVE, MOVE, MOVE
                ];

// 5x10 = 50
// 10x80 = 800
// 10x150 = 1500
// 25x50  = 1250
//  3600
const BODY_CL8_COST = 3600;

class Mil_Omni extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, hrObj, division, max ) {
        let targetRoomName = division.m_tgtRoomName;
        let hRoom        = spawn.room;
        let tRoom        = Game.rooms[targetRoomName];
        let trObj        = RoomHolder.get(targetRoomName);
        let controller   = hRoom.controller;
        let body;
        let cost;

        // If this is a fairly isolated invader attack without healing, we
        // want to reply as quickly as possible, and minimize the size/cost/time to spawn.
        // We can just match the attacking invader's body counts and exceed by 1.
        if(hRoom.controller.level >= 7
           && trObj.m_rmem.hostileCt == 1
           && trObj.m_rmem.hostileOwner == 'Invader'
           && !trObj.m_rmem.hostileBodCt[HEAL]
           ) {
            let ni;
            let mlen;
            let tCt,rCt,aCt,mCt;
            let hBCt = trObj.m_rmem.hostileBodCt;
            let hOCt = trObj.m_rmem.hostileBoostCt;
            
            // The following assumes that invaders only boost with 2x boosts.  (I think that's true!?)
            // If they boost with acids or worst catalyzed acids, this needs revisit..
            // (I have seen catalyzed ones in the SK rooms... in groups -- not single invaders)
            body = [];
            cost = 0;
            
            tCt = (hBCt[TOUGH] ? hBCt[TOUGH] : 0) + (hOCt[TOUGH] ? hOCt[TOUGH] : 0)+1;  
            rCt = (hBCt[RANGED_ATTACK] ? hBCt[RANGED_ATTACK] : 0) + (hOCt[RANGED_ATTACK] ? hOCt[RANGED_ATTACK] : 0)+1;
            aCt = (hBCt[ATTACK] ? hBCt[ATTACK] : 0) + (hOCt[ATTACK] ? hOCt[ATTACK] : 0)+1;  
            
            // If we exceed 25 parts, we'll halve and let military spawn more.
            while(tCt+rCt+aCt > 25){
                tCt /= 2;
                rCt /= 2;
                aCt /= 2;
            }
            
            mCt = (tCt+rCt+aCt);
            for(ni=0; ni<tCt; ni++){
                body.push(TOUGH);
                cost += BODYPART_COST[TOUGH];
            }
            for(ni=0; ni<mCt; ni++){
                body.push(MOVE);
                cost += BODYPART_COST[MOVE];
            }
            for(ni=0; ni<rCt; ni++){
                body.push(RANGED_ATTACK);
                cost += BODYPART_COST[RANGED_ATTACK];
            }
            for(ni=0; ni<aCt; ni++){
                body.push(ATTACK);
                cost += BODYPART_COST[ATTACK];
            }
            
        }

        // Otherwise... omnis are somewhat balanced ranged attack and tough, plus move.
        // RANGED=150
        // ATTACK=80
        // TOUGH=10
        //
        // so a core of:
        //   N x [ TOUGH, RANGED, ATTACK, MOVE, MOVE, MOVE ]
        //     = (N x 390)

        else if(hRoom.controller.level == 8){
            body = BODY_CL8;
            cost = BODY_CL8_COST;
        }
        else {
            let coreCost = 390;
            let nCore = Math.floor(hRoom.energyCapacityAvailable / coreCost);
            body = [];
            let ni;

            if(nCore > 8)
                nCore = 8;  // else we go over 50 body part limit...

            for(ni=0; ni<nCore; ni++)
                body.push(TOUGH);

            for(ni=0; ni<nCore; ni++)
                body.push(RANGED_ATTACK);

            for(ni=0; ni<nCore; ni++)
                body.push(ATTACK);

            for(ni=0; ni<(3*nCore); ni++)
                body.push(MOVE);
            cost = nCore*coreCost;
        }

        if(hRoom.energyAvailable < cost)
            return true;

        // Find a free name and spawn the bot.
        let altTime = 0;
        let multispec = "" ;
        let crname = Creep.spawnCommon(spawn, 'milOmni', body, max, altTime, multispec, targetRoomName);

        // If null, we hit max creeps.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];
        crmem.state     = 'homeRoom';
        crmem.division  = targetRoomName;
        delete crmem.instance;
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

        let tRoomName;
        if(squad && division)
	        tRoomName = division.m_tgtRoomName;

        // Attack logic is independent of move logic.  We'll just attack
        // whatever is closest.  (Should probably refine that later).
        //
        // Avoid attacking source keepers though -- the normal sk clear bots
        // are better equipped (since heavily ranged) and source keepers are mean
        // buggers against omnis.  Better to deal with the main Invader threat
        // and get back to normalcy.
        let hostiles = crObj.getHostiles();
        let hCreep = creep.pos.findClosestByRange
                    (hostiles
                            ,   { filter: function (cr)
                                    {
                                        return (creep.owner.name != 'Source Keeper');
                                    }
                                }
                    );

        let hRange;
        if(hCreep)
            hRange = creep.pos.getRangeTo(hCreep);
        //console.log('Selected hCreep='+hCreep+' range='+hRange);
        if(hCreep && hRange <= 3)
            creep.rangedAttack(hCreep);
        if(hCreep && hRange <= 1){
            creep.attack(hCreep);
            //console.log('Attack hcreep rc='+rc+' creep='+hCreep);
        }


        let hBodCt = {};
        if(hCreep){
            for(let bi=0; bi<hCreep.body.length; bi++){
                let bodEl = hCreep.body[bi];
                let btype = bodEl.type;
                let boost = bodEl.boost;
                if(!bodEl.hits || bodEl.hits == 0)
                    continue;
                if(!hBodCt[btype])
                    hBodCt[btype]=1;
                else
                    hBodCt[btype]++;
                if(boost) {
                    // Over simplification - TBD to figure out boost type/multiplier
                    hBodCt[btype]+=2;
                }
            }
        }

        let fBodCt = {};
        for(let bi=0; bi<creep.body.length; bi++){
            let bodEl = creep.body[bi];
            let btype = bodEl.type;
            let boost = bodEl.boost;
            if(!bodEl.hits || bodEl.hits == 0)
                continue;
            if(!fBodCt[btype])
                fBodCt[btype]=1;
            else
                fBodCt[btype]++;
        }

        let allStruct = crObj.getAllStructures();
        let hStruct;
        if( (!hCreep || hRange > 3)
            && ( creep.room.name == tRoomName
                 || ( (crObj.m_rmem.owner == "reserved" || crObj.m_rmem.owner == "nouser") && !(crObj.m_rmem.hostRoom))
               )
            && division
            && division.m_primaryOrder == 3 /* ORDER_ATTACK */
          ){

            let hStRange;
            hStruct = creep.pos.findClosestByRange
                        (allStruct
                        , {  filter: function(st)
                            { return (st.structureType != STRUCTURE_CONTROLLER
                                     && st.structureType != STRUCTURE_TERMINAL
                                     && st.structureType != STRUCTURE_STORAGE)

                            }
                          }
                        );
            let rc1, rc2;
            if(hStruct)
                hStRange = creep.pos.getRangeTo(hStruct);
            if(hStruct && hStRange <= 3)
                rc1 = creep.rangedAttack(hStruct);
            if(hStruct && hStRange <= 1){
                rc2 = creep.attack(hStruct);
                //console.log('Attack hcreep rc='+rc+' creep='+hCreep);
            }
            //console.log('hStruct found = '+hStruct+ 'rc1='+rc1+' rc2='+rc2);

        }

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'milOmni_E2S19_E2S15_1')
            //    console.log(Game.time+' '+creep.name+' state='+crmem.state+' tRoom='+tRoomName);

            switch(crmem.state){

            case 'homeRoom':
                // When in home room, there's no point moving to target
                // if home room is also under attack.  If there are
                // targets, find and engage.
                if(hCreep)
                    crmem.state = 'engageTargets';
                else if(creep.hits < creep.hitsMax)
                    // Lurk here til we get some healing (towers hopefully)
                    return;
                else
                    crmem.state = 'moveTgtRoom';
                break;

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

                if(!this.m_squad){
                    // Squad must be in reserves.  Verify.
                    if(crmem.division){
                        console.log(creep.name+" DBG OMNI has division but no SQUAD?!");
                        return;
                    }
                    crmem.state = 'moveReclaim';
                    break;
                }

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

                if(creep.room.name != tRoomName){
                    crmem.state = 'moveTgtRoom';
                    break;
                }

                if(creep.name == 'milOmni_E78S97_E71S98_0')
                    console.log('...'+cRoom.memory.hostileTowerCt);

                // If there are hostiles, start getting to work.
                if(   ( !cRoom.memory.hostileTowerCt ||
                        ( Game.time - crmem.arrivalT) > 15
                      )
                   && ( hCreep || ( creep.room.name == 'tRoomName' && allStruct.length ))
                   ){
                    crmem.state = 'engageTargets';
                    break;
                }

                // If not, and we're wounded, move back to staging where we can
                // get healing.
                if(creep.hits < (.90*creep.hitsMax)){
                    crmem.state = 'moveStaging';
                    break;
                }

                // If the room is 'ours', not a room we're manually attacking,
                // then it's a question of whether the room is idle
                // because the enemy is dead, or because they are bouncing.
                // Stick around 15, but then head toward reclaim.
                // Note that even if we start heading to reclaim we can turn back.
                //
                /// TBD... do i still need these sorts of checks?  Wouldn't
                // division standby cover that?
                if(    (cRoom.memory.owner == 'me' || cRoom.memory.owner == 'nouser')
                   && (Game.time - crmem.arrivalT) >= 15
                   && division && division.m_primaryOrder == 2/*ORDER_DEFENCE*/
                   && crObj.m_rmem.hostileOwner == 'Invader'
                   )
                   {
                    crmem.state = 'moveReclaim';
                    break;
                }
                return;

            case 'moveStaging':
                if(creep.hits == creep.hitsMax){
                    crmem.state = 'hostileArrival';
                    break;
                }
                if(!crmem.prevRoom)
                    crmem.prevRoom = crmem.homeName;
                rc = this.actionMoveToRoom(crmem.prevRoom, { ignoreDestructibleStructures: false, maxRooms: 1 });
                if(rc == OK)
                    crmem.state = 'stagingRoom';
                return;

            case 'stagingRoom':
                // If there are targets, start getting to work.
                if(hCreep){
                    crmem.state = 'engageTargets';
                    break;
                }
                //if(creep.hits < .60 * creep.hitsMax){
                //    crmem.state = 'moveHome';
                //    break;
                //}
                if(creep.hits == creep.hitsMax)
                    crmem.state = 'moveTgtRoom';

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
                return;

            case 'engageTargets':

                // Creeps enter this state if room has hostiles.   (That
                // isn't necessarily the case still).

                if(creep.hits < .95*creep.hitsMax){
                    crmem.state = 'moveStaging';
                }
                if(creep.room.name != tRoomName
                   && creep.room.name != crmem.homeName
                   && creep.room.name != crmem.prevRoom
                   ) {
                    crmem.state = 'moveTgtRoom';
                    break;
                }

                // Check if still hostile.  If not move back to the room state
                // for room we're in.
                if(!hCreep && (creep.room.name != tRoomName || allStruct.length == 0)){
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


                if( hCreep &&   Math.abs(hCreep.pos.x) != 0
                    && Math.abs(hCreep.pos.x) != 49
                    && Math.abs(hCreep.pos.y) != 0
                    && Math.abs(hCreep.pos.y) != 49
                    ){
                        // TBD - consider healing..
                        if(hRange > 3 || !hBodCt[ATTACK] || hBodCt[ATTACK] < fBodCt[ATTACK])
                            rc = this.actMoveTo(hCreep, { ignoreDestructibleStructures: false, maxRooms: 1 });
                        else if( hRange <= 2){
                            // Try to range ping.  Unless we can make a quick exit.
                            if(creep.pos.x != 1 && creep.pos.y != 1 && creep.pos.x != 48 && creep.pos.y != 48)
                                this.actionMoveToRoom(crmem.prevRoom, { ignoreDestructibleStructures: false, maxRooms: 1 });
                        }
                        else if (hRange == 3){
                            // stay put
                        }
                }
                else if( creep.room.name == tRoomName && division
                         && division.m_primaryOrder == 3 /* ORDER_ATTACK */){
                    let spawnz = crObj.getSpawns();
                    if(spawnz.length > 0){
                        this.actMoveTo(spawnz[0],{ignoreDestructibleStructures: false, maxRooms: 1 });
                        if(creep.pos.getRangeTo(spawnz[0])<=1)
                            creep.attack(spawnz[0]);
                    }
                    else if(hStruct){
                        this.actMoveTo(hStruct, {maxRooms: 1});
                    }
                    else {
                        let sites = crObj.getSites();
                        if(sites && sites.length > 0)
                            this.actMoveTo(sites[0].pos,  {maxRooms: 1});
                    }
                }

                return;

            case 'moveReclaim':
                // Head back home to reclaim.  But if we got reassigned to a new division,
                // turn back to new target.
                let trObj;
                if(division)
                    trObj = RoomHolder.get(tRoomName);
                if(division && division.m_primaryOrder == /*ORDER_ATTACK*/3 || trObj && trObj.m_rmem.hostileCt){
                    crmem.state = 'moveTgtRoom';
                    break;
                }

                // Are we in a room with spawns? If so head to one & recycle
                let spawns = crObj.getSpawns();
                if(spawns && spawns.length > 0 && spawns[0].my){
                    if(spawns[0].pos.getRangeTo(creep.pos) <= 1)
                        spawns[0].recycleCreep(creep);
                    else
                        this.actMoveTo(spawns[0]);
                    return;
                }

                // Is this room hosted by another? If so we'll find a spawn there.
                // If not head toward home room - maybe we'll cross one.
                if(crObj.m_rmem.hostRoom)
                    rc = this.actionMoveToRoomRouted(crObj.m_rmem.hostRoom);
                else
                    rc = this.actionMoveToRoomRouted(crmem.homeName);
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

module.exports = Mil_Omni;
