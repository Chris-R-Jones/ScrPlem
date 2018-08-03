
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Creep to attack target room controller

class Role_AttackController extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, hrObj, targetRoomName ) {
        let hRoom        = spawn.room;
        let trObj        = RoomHolder.get(targetRoomName);
        let tRoom        = trObj?trObj.m_room:null;
        let controller   = tRoom?tRoom.controller:null;
        let body;
        let cost;
        let max;

        // Need vision first.
        if(!tRoom)
            return false;

        // Make sure this is really a room we want to attack still
        let owner = trObj.m_rmem.owner;
        if(owner == 'nouser' || owner == 'me' || owner == 'none')
            return false;
        if(!controller || !controller.owner || controller.level <= 1)
            return false;

        // With CLAIM parts, we only get 600 ticks til death.
        // We only get to attack every 1000 turns.  Make sure we only
        // spawn if the controller can be attacked within 600 turns.
        // (We actually could add a little bit to this because of spawn time... tbd)
        if(controller.upgradeBlocked && controller.upgradeBlocked > 600)
            return false;

        // We generally want to be doing this from a full capacity L8 room.
        if(hRoom.energyCapacityAvailable < 12900)
            return false;

        let units = Math.floor(hRoom.energyCapacityAvailable / 650);
        cost = (units*650);

        // Wait for it, if not yet available.
        if(hRoom.energyAvailable < cost)
            return true;

        // Build the body
        body = [];
        for(let ui=0; ui<units; ui++){
            body.push(CLAIM);
            body.push(MOVE);
        }
        max = 1;

        // Find a free name and spawn the bot.  No alts needed
        let altTime = 0
        let multispec = "";

        let crname = Creep.spawnCommon(spawn, 'atkctrl', body, max, altTime, multispec, targetRoomName, "global");

        // If null, we hit max creeps.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];

        crmem.tRoomName = targetRoomName;
        crmem.state     = 'moveTargetRoom';
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

	    let debug="";

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            console.log(creep.name+' state='+crmem.state+' pos='+creep.pos);

            switch(crmem.state){
            case 'moveTargetRoom':
                rc = this.actionMoveToRoomRouted(crmem.tRoomName);
                if(rc == OK) {
                    this.setTarget(cRoom.controller);
                    crmem.state = 'attack';
                    break;
                }
                return;

            case 'attack':
                if(cRoom.name != crmem.tRoomName){
                    console.log(creep.name+' pos='+creep.pos+'BUG! not in target room');
                    crmem.state = 'moveTargetRoom';
                    break;
                }
                rc = this.actionAttackController(cRoom.controller);
                return;

            default:
                console.log('BUG! Unrecognized creep state='+crmem.state+' for creep='+creep.name+' pos='+creep.pos);
                crmem.state = 'moveTargetRoom';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' pos ='+creep.pos+' exceeded max loops\n'+debug);
	}
}

module.exports = Role_AttackController;
