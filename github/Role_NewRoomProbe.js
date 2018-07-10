
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');


// Simple bot to travel to and establish vision in a target room for new room build
// activities.

// teeny weenie
const BODY_M1 = [ MOVE ];
const BODY_M1_COST = 50;

class Role_NewRoomProbe extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, hrObj, homeRoomName, targetRoomName ) {
        let hRoom        = spawn.room;
        let trObj        = RoomHolder.get(targetRoomName);
        let tRoom        = trObj ? trObj.m_room : null;
        let body;
        let cost;
        let max;

        if(hRoom.controller.level < 3)
            return false;

        if(hRoom.name != homeRoomName )
            return;

        if(tRoom)   // If we already have vision, don't need it.
            return;

        // Choose the body we want and will wait for energy for.
        if(hRoom.energyCapacityAvailable >= BODY_M1_COST){
            body = BODY_M1;
            cost = BODY_M1_COST;
            max = 1;
        }

        // Wait for it, if not yet available
        if(hRoom.energyAvailable < cost)
            return true;

        // Find a free name and spawn the bot.
        // No alt need, not time sensitive.
        let crname = Creep.spawnCommon(spawn, 'nrprobe', body, max, 0, targetRoomName);


        // if null we must already have it.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];

        // Initialze memory for the role.
        crmem.state = 'init';
        crmem.tRoomName = targetRoomName;
        delete crmem.instance
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

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            switch(crmem.state){

            case 'init':
                crmem.state = 'moveA';
                return;

            case 'moveA':
                if(this.actionMoveToRoomRouted(crmem.tRoomName) == OK){
                    crmem.state = 'linger';
                    break;
                }
                return;

           case 'linger':
                if(creep.room.name != crmem.tRoomName){
                    crmem.state = 'moveA';
                    break;
                }
                // Look around for sites we don't own and walk/remove them.
                let crObj = RoomHolder.get(creep.room.name);
                let sites = crObj.getSites();
                let site = creep.pos.findClosestByRange
                           (sites
                            ,   { filter: function (st)
                                    {
                                        return !(st.my);
                                    }
                                }
                            );
                if(site){
                    this.setTarget(site);
                    crmem.state = 'walkEnemySite';
                    break;
                }
                return;

            case 'walkEnemySite':
                let target = Game.getObjectById(crmem.targetId);
                if(!target){
                    this.clearTarget();
                    crmem.state = 'linger';
                    break;
                }
                this.actMoveTo(target.pos, { maxRooms:1 });
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

module.exports = Role_NewRoomProbe;
