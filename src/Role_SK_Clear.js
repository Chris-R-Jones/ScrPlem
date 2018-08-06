
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// The SK_Clear is designed to try to keep source keeper rooms clear, minimizing cost.
// While an armed creep, we don't treat this as a military creep since it
// has a pretty dedicated and fixed role in cleaning source keepers to allow
// harvesting.


// How to clear SK most effectively probably needs some deeper examination.
// However, I'm going to try to take advantage of the fact that SKs don't
// pursue too far from their lair, they have no healing, and they are slow.
// While they do have ranged and a lot of tough, I think I can just outlast
// them and keep ranged, healing to recover and move on.

const BODY_M1 =
    [ TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH
    , RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK
    , RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK
    , HEAL, HEAL, HEAL, HEAL, HEAL
    , MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE
    , MOVE, MOVE, MOVE, MOVE, MOVE
    , MOVE, MOVE, MOVE, MOVE, MOVE
    , MOVE, MOVE, MOVE, MOVE, MOVE
    ];

const BODY_M1_COST = ( 100    /* 10 x TOUGH (10 each) */
                     + 1500   /* 10 x RANGED (150 each) */
                     + 1250   /*  5 x HEAL   (250 each) */
                     + 1250   /* 25 x MOVE   (50 each) */
                     );


// The above body didn't have a lot of firepower and needed two creeps.
// I'm going to try using MOVE as tough, get rid of the tough, and double
// the ranged attack.  I'm hoping that can do away with the creeps with
// a single bot, saving CPU, we'll see..
// (leaving BODY_M1 for posterity or in case i need to go back)
const BODY_M2 =
    [ MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE
    , MOVE, MOVE, MOVE, MOVE, MOVE
    , MOVE, MOVE, MOVE, MOVE, MOVE
    , MOVE, MOVE, MOVE, MOVE, MOVE
    , RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK
    , RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK
    , RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK
    , RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK
    , HEAL, HEAL, HEAL, HEAL, HEAL
    ];

const BODY_M2_COST = ( 3000   /* 20 x RANGED (150 each) */
                     + 1250   /*  5 x HEAL   (250 each) */
                     + 1250   /* 25 x MOVE   (50 each) */
                     );

class Role_SK_Clear extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, hrObj, trObj, targetRoomName ) {
        let room        = spawn.room;
        let controller  = room.controller;
        let body;
        let cost;

        // Only need these creeps if the room is L7.  I've heard it said,
        // that spawn congestion makes this impractical at earlier levels.
        // (This probably needs some thought and verification, but for now
        //  it works)
        if(controller.level < 7)
            return false;

        // Only need these creeps in rooms that are marked as SK rooms.
        if(!trObj.m_rmem || !trObj.m_rmem.keeperRoom)
            return false;

        if(room.energyCapacityAvailable >= BODY_M2_COST){
            body = BODY_M2;
            cost = BODY_M2_COST;
        }

        // Wait for it, if not yet available
        if(room.energyAvailable < cost)
            return true;

        // Generally 1 is enough to control the room.  But if we see construction
        // sites, it's probably a sign we've fallen behind, esp if the room is new.
        // So, let's try two in that case.
        let max = 1;
        let sites = trObj.getSites();
        if( (sites && sites.length > 0) || trObj.getHostiles().length >= 3)
            max=2;

        // Find a free name and spawn the bot.
        let alttime = 200;

        let crname = Creep.spawnCommon(spawn, 'skclear', body, max, alttime, "", targetRoomName);

        // This at least should mean we hit max creeps.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];

        crmem.state = 'init';
        crmem.tRoomName = targetRoomName;
        return true;
    };


    // Logic callback invoked to have a creep run it's actions - derived from
    // base Creep class (a 'virtual function' or whatever you call it in JS).
	runLogic()
	{
	    let crmem = this.m_crmem;
	    let creep = this.m_creep;
	    let rObj  = RoomHolder.get(creep.room.name);
	    let hostiles = rObj.getHostiles();
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
        let debug = "";
        let activeParts;
        let target;

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'skclear_W5N33_W5N34_1')
            //    console.log(Game.time+' '+creep.name+' state='+crmem.state+' loop='+exceed+' pos='+creep.pos+' tRoom='+crmem.tRoomName);

            switch(crmem.state){
            case 'init':
                crmem.state = 'moveTargetRoom';
                break;

            case 'moveTargetRoom':
                rc=this.actionMoveToRoomRouted(crmem.tRoomName);
                if(rc == OK) {
                    crmem.state = 'pickTarget';
                    break;
                }
                return;
            case 'pickTarget':
                if(creep.room.name != crmem.tRoomName){
                    crmem.state = 'moveTargetRoom';
                    break;
                }
                // Find nearest hostile creep.
                target = creep.pos.findClosestByRange(hostiles);
                let wounded = rObj.getWounded();
                let wound;

                if(wounded.length > 0){
                    wound = creep.pos.findClosestByRange
                            (wounded
                            ,   { filter: function (cr)
                                    {
                                        return (cr.name != creep.name);
                                    }
                                }
                            );
                }
                // If there are friendlies that need healing, we'll
                // tend to them but only if there isn't a hostile nearby,
                // in which case we attack hostile first.
                if(target && (!wound  || target.pos.getRangeTo(creep)<=10)){
                    this.setTarget(target);
                    crmem.state = 'attackTarget';
                    break;
                }
                if(wound){
                    rc=this.actMoveTo(wound.pos, { maxRooms: 1});
                    if(creep.pos.getRangeTo(wound) > 4){
                        creep.heal(creep);
                    }
                    else{
                        creep.rangedHeal(wound);
                        creep.heal(wound);
                    }
                    return;
                }

                // Heal ourselves, but try to move to next position while doing so.
                if(creep.hits < creep.hitsMax)
                    creep.heal(creep);

                // If no targets, move to lair with lowest time to spawn
                let lairs = rObj.getLairs();
                let prevLair;
                let nextLair;
                for(let li=0; li<lairs.length; li++){
                    let lair = lairs[li];
                    if(!nextLair || lair.ticksToSpawn < nextLair.ticksToSpawn){
                        prevLair = nextLair;
                        nextLair = lair;
                    }
                    if(!prevLair && lair != nextLair)
                        prevLair = lair;
                }
                if(crmem.instance == 0){
                    if(nextLair && creep.pos.getRangeTo(nextLair) > 5)
                        this.actMoveTo(nextLair,{ maxRooms: 1});
                }
                else {
                    if(prevLair && creep.pos.getRangeTo(prevLair) > 5)
                        this.actMoveTo(prevLair,{ maxRooms: 1});
                }
                return;

            case 'attackTarget':
                target = Game.getObjectById(crmem.targetId);
                if(!target){
                    this.clearTarget();
                    crmem.state = 'pickTarget';
                    break;
                }
                if(!crmem.safePosX){
                    // Save a location we can retreat to when source keeper gets
                    // too close.
                    crmem.safePosX = creep.pos.x;
                    crmem.safePosY = creep.pos.y;
                }

                // Whenever we have exhausted our TOUGH,
                // we need to retreat and recoup.
                if(creep.hits < (creep.hitsMax*.70)){
                    this.clearTarget();
                    crmem.state = 'healTowardHome';
                    break;
                }

                let range = creep.pos.getRangeTo(target);
                if(range <= 3)
                    creep.rangedAttack(target);
                creep.heal(creep);
                if( range > 3 )
                    this.actMoveTo(target, { maxRooms: 1 } );
                else if ( range <= 2 )
                    this.actMoveTo(crmem.safePosX, crmem.safePosY);
                return;

            case 'healTowardHome':
                creep.heal(creep);
                if(creep.hits == creep.hitsMax){
                    crmem.state = 'moveTargetRoom';
                    break;
                }
                target = creep.pos.findClosestByRange(hostiles);
                if(creep.pos.getRangeTo(target) >= 4 && creep.getActiveBodyparts(HEAL)>=1 )
                    return;
                rc = this.actionMoveToRoomRouted(crmem.homeName);
                return;

            default:
                console.log(creep.name+' BUG! Unknown state '+crmem.state);
                crmem.state = 'init';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);
	}
}

module.exports = Role_SK_Clear;
