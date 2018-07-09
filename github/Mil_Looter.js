
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Fat CARRY creep that just moves resources from nearby recently taken
// room's storage & containers, back home.
class Mil_Looter extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };
    
    static spawn( spawn, hrObj, targetRoomName, maxCreeps ) {
        let hRoom        = spawn.room;
        let tRoom        = Game.rooms[targetRoomName];
        let trObj        = RoomHolder.get(targetRoomName);
        let controller   = hRoom.controller;
        let si;

        // Get storage or container nearest to spawns, if not built yet 
        // we're not ready/
        let spStorage = hrObj.getSpawnStorage();
        if(!spStorage)
            return false;
            
        // Body will be equal parts CARRY MOVE
        let nUnit = Math.floor(hRoom.energyAvailable / 100);
        let body = [];
        let ni;
                
        if(nUnit > 25)
            nUnit = 25;
        for(ni=0; ni<nUnit; ni++)
            body.push(CARRY);
        
        for(ni=0; ni<nUnit; ni++)
            body.push(MOVE);
        
        // Wait for it, if not yet available.
        if(hRoom.energyAvailable < hRoom.energyCapacityAvailable)
            return true;
        
        // Find a free name and spawn the bot.
        // We need one instance per source, so this is pretty easy.  Do
        // enable alts.
        // TBD For alt time, this is basically 50.  Probably want to revisit that
        // for remote haresters, and add at least an additional 50 given they
        // will be lower in spawn order and have longer to travel... 
        let altTime = 0;
        let crname = Creep.spawnCommon(spawn, 'milLooter', body, maxCreeps, altTime, "", targetRoomName);
        
        // If null, we hit max creeps.
        if(crname == null)
            return false;
        
        let crmem  = Memory.creeps[crname];
        
        crmem.tRoomName = targetRoomName;
        crmem.state     = 'moveTgtRoom';

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
	    let tRoom  = Game.rooms[crmem.tRoomName];
	    let trObj  = RoomHolder.get(crmem.tRoomName);
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
	    let debug="";
	        
	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'milLooter_W11N22_W10N22_2')
            //    console.log('T='+Game.time+' '+creep.name+' state='+crmem.state);
            

            switch(crmem.state){

            case 'moveTgtRoom':
                rc = this.actionMoveToRoom(crmem.tRoomName);
                if(rc == OK) {
                    crmem.state = 'pickEnergy'
                    break;
                }
                return;
                
            case 'pickEnergy':

                if(_.sum(creep.carry) == creep.carryCapacity){
                    crmem.state = 'pickFill';
                    break;
                }

                // If there are dropped resources, go get
                let dropped = trObj.getDroppedResources();
                console.log('Dropped length = '+dropped.length);
                if(dropped && dropped.length > 0){
                    let tdrop = creep.pos.findClosestByPath( dropped );
                    console.log('Selecting tdrop='+tdrop+' id='+tdrop.id);
                    this.setTarget(tdrop);
                    crmem.state = 'getDropped';
                    break;
                }

                let containers = trObj.getContainers();
                let container = creep.pos.findClosestByPath
                                ( containers
                                ,   { filter: function (st) 
                                        {
                                            return (_.sum(st.store) > 0);
                                        }
                                    }
                                );
                if(container)
                    this.setTarget(container);
                else if (tRoom.storage && _.sum(tRoom.storage.store) > 0)
                    this.setTarget(tRoom.storage);
                else {
                    if(_.sum(creep.carry)>0){
                        crmem.state = 'pickFill';
                        break;
                    }
                    else {
                        crmem.state = 'recycle';
                        break;
                    }
                }
                crmem.state = 'withdrawStruct';
                break;    


            case 'getDropped':
                rc=this.pickupDropped(null);
                if(rc == ERR_FULL){
                    crmem.state = 'pickFill';
                    break;
                }
                if(rc == OK)
                    return;
                crmem.state = 'pickEnergy';
                if(rc == ERR_NOT_ENOUGH_RESOURCES || rc == ERR_NO_PATH)
                    return;
                break;

            case 'withdrawStruct':
                rc=this.withdrawStruct(null);
                if(rc == ERR_FULL){
                    crmem.state = 'pickFill';
                    break;
                }
                if(rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    if(_.sum(creep.carry) == creep.carryCapacity)
                        crmem.state = 'pickFill';
                    else
                        crmem.state = 'pickEnergy';
                    return;
                }
                if(rc == ERR_NO_PATH){
                    crmem.state = 'moveTgtRoom';
                    return;
                }
                crmem.state = 'moveTgtRoom';                
                break;

            case 'pickFill':
                let spStorage = hrObj.getSpawnStorage();
                if(!spStorage)
                    return false;
                
                this.setTarget(spStorage);
                crmem.state = 'fillStructure';
                break;

            case 'fillStructure':
                rc=this.fillTarget(null);
                if(rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    crmem.state = 'moveTgtRoom';
                    break;
                }
                if(_.sum(creep.carry) == 0){
                    crmem.state = 'moveTgtRoom';
                }
                else{
                    crmem.state = 'pickFill';
                }
                break;

            case 'recycle':
                // Head back home to reclaim.
                 rc = this.actionMoveToRoom(crmem.homeName);
                if(rc != OK)
                    return;
                let spawns = hrObj.getSpawns();
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

module.exports = Mil_Looter;
