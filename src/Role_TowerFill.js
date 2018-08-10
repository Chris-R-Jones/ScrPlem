
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// The distributor creep is dedicated to moving energy to towers when under attack.


const BODY_M1 = [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE];
const BODY_M1_COST = 300;
const BODY_L7 = [CARRY, CARRY, CARRY, CARRY,CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
const BODY_L7_COST = 600;


class Role_TowerFill extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, hrObj ) {
        let room        = spawn.room;
        let controller  = room.controller;
        let body;
        let cost;
        let max;
        let altTime;

        // Bootstrappers will take care of protection for early rooms
        if(controller.level < 4)
            return false;

        // Another prereq is that spawn storage is built.
        let spStorage = hrObj.getSpawnStorage();
        if(!spStorage)
            return false;

        // Only spawn if some tower is < 50%
        let towerList = hrObj.getTowers();
        let ti;
        for(ti=0; ti<towerList.length; ti++){
            if(towerList[ti].energy < (towerList[ti].energyCapacity/2))
                break;
        }
        if(ti == towerList.length)
            return false;

        body = BODY_L7;
        cost = BODY_L7_COST;

        max  = 4;
        altTime = (body.length*3)+10;

        // Wait for it, if not yet available
        if(room.energyAvailable < cost)
            return true;

        // Find a free name and spawn the bot.
        // For first room we'll boot a gazillion of them, so no
        // need for alt names or such.
        let crname = Creep.spawnCommon(spawn, 'tfill', body, max, altTime);

        // If null, max creeps are already spawned.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];

        // Initialze memory for the role
        crmem.state = 'init';
        delete crmem.instance;

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
	    let dropped;

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'distrib_W2N26_1')
            //    console.log(creep.name+'T='+Game.time+' loop='+exceed+' state='+crmem.state);

            switch(crmem.state){
            case 'init':
                crmem.state = 'pickEnergy';
                break;

            case 'pickEnergy':
                // Get storage or container nearest to spawns, if not built yet
                let spStorage = hrObj.getSpawnStorage();
                if(!spStorage)
                    return false;

                // If there are dropped resources within range 6 of storage,
                // then go get it.

                dropped = hrObj.getDroppedResources();
                if(dropped && dropped.length > 0){
                    let di;
                    let drop;
                    for(di=0; di<dropped.length; di++){
                        drop = dropped[di];
                        if(creep.pos.getRangeTo(drop.pos) <= 6
                           && drop.resourceType == RESOURCE_ENERGY){
                            this.setTarget(drop);
                            crmem.state = 'getDropped';
                            break;
                        }
                    }
                    if(di != dropped.length)
                        break;
                }

                // Else grab from storage.
                this.setTarget(spStorage);
                crmem.state = 'withdrawStruct';
                break;

            case 'withdrawStruct':
                rc=this.withdrawStruct(RESOURCE_ENERGY);
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

            case 'getDropped':
                rc=this.pickupDropped(RESOURCE_ENERGY);
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

            case 'pickFill':

                // Check for very low towers < 50% first
                let towerList = hrObj.getTowers();
                let ti;
                let tower;
                let lowestAmt;
                let lowestIdx = -1;
                for(ti=0; ti<towerList.length; ti++){
                    tower = towerList[ti];
                    if((lowestIdx==-1) || tower.energy < lowestAmt){
                        lowestAmt = tower.energy;
                        lowestIdx = ti;
                    }
                }
                if(lowestIdx != -1){
                    tower = towerList[lowestIdx];
                    if(tower.energy < tower.energyCapacity){
                        this.setTarget(tower);
                        crmem.state = 'fillStructure';
                        break;
                    }
                }
                // Nothing to fill, move to one of the towers to stay
                // out of the way
                if(towerList.length)
                    this.actMoveTo(towerList[0]);

                return;

            case 'fillStructure':
                rc=this.fillTarget(RESOURCE_ENERGY);
                debug=debug + '\t ..rc='+rc+'\n';

                if(rc == OK)
                    return;
                else if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    crmem.state = 'pickEnergy';
                    break;
                }
                else if(rc == ERR_FULL){
                    crmem.state = 'pickFill';
                    break;
                }
                else
                    console.log(creep.name+' fillTarget rc='+rc+' target='+this.getTarget());

                if(creep.carry.energy < 50){
                    crmem.state = 'pickEnergy';
                    break;
                }
                crmem.state = 'pickFill';
                break;

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

module.exports = Role_TowerFill;
