var Preference      = require('Preference');
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Role_Test is just a bot for doing some testing before deploying other
// places.  It is never executed in the normal spawn loop, has a special
// exec last after everything else, so shouldn't impact other activities.


// teeny weenie
const BODY_M1 = [ MOVE ];
const BODY_M1_COST = 50;

class Role_Test extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn ) {
        let room        = spawn.room;
        let controller  = room.controller;
        let body;
        let cost;
        let max;

        // Choose the body we want and will wait for energy for.
        if(room.energyCapacityAvailable >= BODY_M1_COST){
            body = BODY_M1;
            cost = BODY_M1_COST;
            max = 1;
        }

        // Wait for it, if not yet available
        if(room.energyAvailable < cost)
            return true;

        // Find a free name and spawn the bot.
        // No alt need, not time sensitive.
        let crname = Creep.spawnCommon(spawn, 'test', body, max, 400);

        // if null we must already have it.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];

        // Initialze memory for the role.
        crmem.state = 'init';
        crmem.allowExplore = true;
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
	    let rObj  = RoomHolder.get(creep.room.name);
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
	    let debug="";

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //console.log('T='+Game.time+' '+creep.name+' pos='+creep.pos+' state='+crmem.state);

            switch(crmem.state){

            case 'init':
                crmem.state = 'moveA';
                return;

            case 'moveA':
                if(creep.pos.x != 9 || creep.pos.y != 19)
                    creep.moveTo(9,19);
                else
                    crmem.state = 'moveB';
                return;

            case 'moveB':
                if(creep.pos.x != 6 || creep.pos.y != 41)
                    creep.moveTo(6,41);
                else
                    crmem.state = 'moveC';
                return;

            case 'moveC':
                if(creep.pos.x != 14 || creep.pos.y != 34)
                    creep.moveTo(14,34);
                else
                    crmem.state = 'moveD';
                return;

            case 'moveD':
                if(creep.pos.x != 6 || creep.pos.y != 41)
                    creep.moveTo(6,41);
                else
                    crmem.state = 'moveA';
                return;

            case 'moveE':
                let tgtPos = new RoomPosition(14,34,creep.room.name);
                //Game.getObjectById('5982fe5eb097071b4adc0c93');
                let rc = this.defenceMatMove(tgtPos);
                console.log('... defMove rc ='+rc);
                crmem.state = 'moveA';
                return;

            case 'moveC':

                return;


            case 'moveD':

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

module.exports = Role_Test;
