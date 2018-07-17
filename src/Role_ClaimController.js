
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Creep to claim new room


const BODY_M1 = [ CLAIM, MOVE ];
const BODY_M1_COST = 650;

class Role_ClaimController extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, hrObj, hostRoomName, targetRoomName ) {
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

        // We may be trying to watch a room we've captured, to reserve it as
        // soon as it becomes unowned (when controller degrades).  If it's not
        // nouser yet -- and not soon to be -- then just wait.
        //   If it's soon to be (200 turns) we'll still spawn just to reserve as soon
        // as possible.
        if(trObj.m_rmem.owner != 'nouser'){
            if(trObj.m_rmem.owner != 'me' && trObj.m_rmem.owner != 'none'){
                if(controller.level != 1
                   || !controller.ticksToDowngrade
                   || controller.ticksToDowngrade > 200
                  )
                   return false;
            }
            if(trObj.m_rmem.owner != 'me' || (controller.owner && controller.my) )
                return false;
        }

        // Check if we still need this.
        if(controller.owner && controller.my)
            return false;

        // Filter if we want to control what rooms host the new room, else
        // just past null.
        if(hostRoomName && spawn.room.name != hostRoomName)
            return false;

        // Choose the body we want and will wait for energy for.
        if(hRoom.energyCapacityAvailable >= BODY_M1_COST){
            body = BODY_M1;
            cost = BODY_M1_COST;
            max  = 1;
        }
        else {
            console.log('Energy capacity = '+hRoom.energyCapacityAvailable);
            return true;
        }

        // Wait for it, if not yet available.
        if(hRoom.energyAvailable < cost)
            return true;

        // Find a free name and spawn the bot.  No alts needed
        let altTime = 0
        let multispec = "";

        let crname = Creep.spawnCommon(spawn, 'claim', body, max, altTime, multispec, targetRoomName);

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

            //console.log(creep.name+' state='+crmem.state+' pos='+creep.pos);

            switch(crmem.state){
            case 'moveTargetRoom':
                rc = this.actionMoveToRoomRouted(crmem.tRoomName);
                if(rc == OK) {
                    this.setTarget(cRoom.controller);
                    crmem.state = 'reserve';
                    break;
                }
                return;

            case 'reserve':
                if(cRoom.name != crmem.tRoomName){
                    console.log(creep.name+'BUG! not in target room');
                    crmem.state = 'moveTargetRoom';
                    break;
                }
                rc = this.actionClaimController(cRoom.controller);
                return;

            default:
                console.log('BUG! Unrecognized creep state='+crmem.state+' for creep='+creep.name);
                crmem.state = 'moveTargetRoom';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);
	}
}

module.exports = Role_ClaimController;
