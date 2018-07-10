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

class Mil_AtkBoostDecon extends Creep
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
        let body;

        // Wait for full energy.
        if(hRoom.energyAvailable < BODY_M1_COST)
            return true;
        body = BODY_M1;

        // Find a free name and spawn the bot.
        let altTime = 0;
        let multispec = "" ;
        let crname = Creep.spawnCommon(spawn, 'milAtkDecon', body, max, altTime, multispec, targetRoomName);

        // If null, we hit max creeps.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];
        crmem.division  = targetRoomName;
        crmem.state     = 'init';
        delete crmem.instance
        return true;
    };


    // Logic callback invoked to have a creep run it's actions - derived from
    // base Creep class (a 'virtual function' or whatever you call it in JS).
	runLogic()
	{
	    let squad = this.m_squad;
	    let division;
	    let crmem = this.m_crmem;
	    let creep = this.m_creep;
	    let cRoom  = creep.room;
	    let crObj  = RoomHolder.get(cRoom.name);
	    let maxLoop = 5;
	    let exceed;
	    let debug="";

	    if(squad)
	        division = squad.m_division;
	    if(!squad || (squad && !division)) {
            // Creep either spawned after squad/division stood down (it has no squad)
            // or it's squad must be in reserves.  Head to reclaim.
	        crmem.state = 'moveReclaim';
	    }

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'milDecon_E75S97_E72S97_0')
            console.log(creep.name+' loop'+exceed+' state='+crmem.state);

            switch(crmem.state){

            case 'init':
                crmem.state = 'boost';
                break;

            case 'boost':
                // Check if we're fully boosted, if not find some for my parts.
                crmem.state = 'rejoinSquad';
                break;

            case 'rejoinSquad':
                // Creep is put in this state if it has strayed too far from squad.
                // (often, it's newly spawned).  Rejoin the group.
                if(creep.room.name != squad.tgtPos.roomName){
                    rc = this.actionMoveToRoomRouted(squad.tgtPos.roomName);
                    return;
                }
                if(creep.pos.getRangeTo(squad.tgtPos.x, squad.tgtPos.y) > MAX_SQUAD_RANGE){
                    this.actMoveTo(squad.tgtPos.x, squad.tgtPos.y);
                    return;
                }
                crmem.state = 'inSquadCheckOrders';
                break;

            case 'inSquadCheckOrders':
                // Check if we're still in squad range.  If not, rejoin.
                if(creep.room.name != squad.tgtPos.roomName
                   || creep.pos.getRangeTo(squad.tgtPos.x, squad.tgtPos.y) > MAX_SQUAD_RANGE){
                       crmem.state = 'rejoinSquad';
                       break;
                }
                return;

            case 'moveReclaim':
                // Head back home to reclaim (if we arent' already there)
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

module.exports = Mil_AtkBoostDecon;
