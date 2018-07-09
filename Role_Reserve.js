
var Preference      = require('Preference');
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Creep to reserve remote harvest rooms.


const BODY_M1 = [ CLAIM, MOVE ];
const BODY_M1_COST = 650;

const BODY_M2 = [ CLAIM, CLAIM, MOVE, MOVE ];
const BODY_M2_COST = 1300;

const BODY_M3 = [ CLAIM, CLAIM, CLAIM, MOVE, MOVE, MOVE ];
const BODY_M3_COST = 1950;


class Role_Reserve extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };
    
    static spawn( spawn, hrObj, targetRoomName ) {
        let hRoom        = spawn.room;
        let tRoom        = Game.rooms[targetRoomName];
        let trObj        = RoomHolder.get(targetRoomName);
        let controller   = hRoom.controller;
        let body;
        let cost;
        let max;
        
        // Need vision first.
        if(!trObj || !trObj.m_room)  
            return false;

        // Make sure room has reached L3 and at least 8 extensions.
        if(controller.level < 3)
            return false;

        if(controller.level == 3) {
            let exten = hrObj.getExtensions();
            if(exten.length < 10)
                return false;
        }
        
        if(tRoom.controller.owner)
            return false;

        // Get storage or container nearest to spawns, if not built yet 
        // we're not ready/
        let spStorage = hrObj.getSpawnStorage();
        if(!spStorage)
            return false;
        
        let reservation  = tRoom.controller.reservation;
        if(reservation && reservation.ticksToEnd > 4000)
            return false;

        // Choose the body we want and will wait for energy for. 
        if(hRoom.energyCapacityAvailable >= BODY_M3_COST){
            body = BODY_M3;
            cost = BODY_M3_COST;
            max  = 1;
        }
        else if(hRoom.energyCapacityAvailable >= BODY_M2_COST){
            body = BODY_M2;
            cost = BODY_M2_COST;
            max  = 1;
        }
        else if(hRoom.energyCapacityAvailable >= BODY_M1_COST){
            body = BODY_M1;
            cost = BODY_M1_COST;
            max  = 2;
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
        
        let crname = Creep.spawnCommon(spawn, 'reserve', body, max, altTime, multispec, targetRoomName);
        
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
        let tRoom  = Game.rooms[crmem.tRoomName];
        let trObj  = RoomHolder.get(crmem.tRoomName); 
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
	    let structs;
	    
	    let debug="";
	    
	    // Defence
	    if(crObj.getHostiles().length > 0 || trObj.m_rmem.hostileCt > 0 ){
	        let hrObj = RoomHolder.get(crmem.homeName);
	        let hRoom = Game.rooms[crmem.homeName];
	        let towers = hrObj.getTowers();
	        
	        if(towers && towers.length)
	            this.actMoveTo(towers[0]);
	        else
	            this.actMoveTo(hrObj.getSpawns()[0]);
	        this.clearTarget();
	        crmem.state = 'moveTargetRoom';
	        return;
	    }
	    
	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';
        
            // if(creep.name == 'reserve_W8N28_W7N28_1')
            //    console.log(creep.name+' state='+crmem.state+' pos='+creep.pos);
        
            switch(crmem.state){
            case 'moveTargetRoom':
                rc = this.actionMoveToRoom(crmem.tRoomName);
                if(rc == OK) {
                    this.setTarget(cRoom.controller);
                    crmem.state = 'reserve';
                    break;
                }
                return;
    
            case 'reserve':
                if(cRoom.name != crmem.tRoomName && !tRoom){
                    crmem.state = 'moveTargetRoom';
                    break;
                }
                rc = this.actionReserveController(tRoom.controller);
                
                //if(creep.name == 'reserve_W8N28_W7N28_1')
               //    console.log('reserve controller rc='+rc);
                
                if(!tRoom.controller.sign
                   || tRoom.controller.sign.text != Preference.signText
                   ){
                    crmem.state = 'signController';
                    break;
                }
                return;

            case 'signController':
                if(cRoom.name != crmem.tRoomName && !tRoom){
                    crmem.state = 'moveTargetRoom';
                    break;
                }
                //if(creep.name == 'reserve_W8N28_W7N28_1')
                //    console.log(creep.name+'reserve Signing in '+cRoom.name+' '+crmem.tRoomName);
                if(tRoom.controller.pos.getRangeTo(creep.pos)>1){
                    this.actMoveTo(tRoom.controller);
                    return;
                }
                rc= creep.signController(tRoom.controller, Preference.signText);
                //if(creep.name == 'reserve_W8N28_W7N28_1')
                //    console.log('sign controller rc='+rc);
                crmem.state = 'reserve';
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

module.exports = Role_Reserve;
