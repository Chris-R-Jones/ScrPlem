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
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
	    let debug="";
	    
	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //console.log('T='+Game.time+' '+creep.name+' pos='+creep.pos);

            switch(crmem.state){
                
            case 'init':
                crmem.state = 'moveA';
                return;     
            
            case 'moveA':
                if(this.actionMoveToRoomRouted(Preference.testR1) == OK){
                    crmem.state = 'moveB';
                    break;
                }
                return;
 
            case 'moveB':
                if(this.actionMoveToRoomRouted(Preference.testR2) == OK){
                    crmem.state = 'moveC';
                    break;
                }
                return;

            case 'moveC':
                if(this.actionMoveToRoomRouted(Preference.testR3) == OK){
                    crmem.state = 'moveD';
                    break;
                }
                return;
                

            case 'moveD':
                //this.actMoveTo(10,25);
                //creep.say('YPReserved',true);
                if(this.actionMoveToRoomRouted(Preference.testR4) == OK){
                    crmem.state = 'moveA';
                    break;
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

module.exports = Role_Test;
