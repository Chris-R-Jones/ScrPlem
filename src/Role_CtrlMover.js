
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Ctrl mover is a just moves energy from central spawn storage to a container
// placed at controller, to feed energy to dedicated control upgraders.
// Its size is based on energy levels in storage, like the dedicated control upgraders,
// so the two bots work closely together.)

class Role_CtrlMover extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, hrObj ) {
        let hRoom        = spawn.room;
        let controller   = hRoom.controller;

        // Make sure room has reached L3 and at least 10 extensions.
        if(controller.level < 3)
            return false;

        if(controller.level == 3) {
            let exten = hrObj.getExtensions();
            if(exten.length < 10)
                return false;
        }

        // If the room is in the process of being upgraded, hold off on
        // controller points and steer energy toward the building.
        if(!hrObj.m_rmem.lastPlanT && controller.level <= 4)
            return false;

        // Get storage or container nearest to spawns, if not built yet
        // we're not ready/
        let spStorage = hrObj.getSpawnStorage();
        if(!spStorage)
            return false;

        // Get container near controller.
        let ctrlCon = hrObj.getControllerContainer();
        if(!ctrlCon)
            return false;

        // See if we stored a source path for this source to that
        // container.
        let path = hrObj.getStoreControllerPath();

        // For every 20000 energy in storage, we spawn 5x of WORK in our
        // upgraders.  So, 5E per turn.
        // So this creep needs to move at least 5E per turn to the container.
        // Both this creep and the upgrader are moderated over time by the storage level.
        // If they aren't moving/upgrading fast enough, storage energy levels will
        // grow, and they allocate another 5 WORK and associated energy movement.

        // Two trips, plus two ticks of loadunload is:
        //  (2*pathLength)+2 ticks per load.
        // (Plus any rerouting time)
        // So, the mover needs to be able to carry the 5 times E that
        // is consume by the upgraders in that duration.
        // (per 20000)

        let multiplier;
        if(spStorage.structureType == STRUCTURE_CONTAINER)
            multiplier = 5;
        else
            multiplier = Math.max(1,spStorage.store.energy / 20000);

        // At L8, we're limited to 15E per turn, so this becomes more fixed.
        if(controller.level == 8)
            multiplier = 3;

        let additional = (controller.level == 8)?10:6;
        let perTripE = 5*multiplier*(2 * path.length + additional);

        let carryNeeded = Math.ceil(perTripE / 50);
        let moveNeeded  = Math.ceil(carryNeeded/2);
        let totalCost = (moveNeeded+carryNeeded)*50;
        let maxCreeps = Math.ceil(totalCost / hRoom.energyCapacityAvailable);

        let perCreepCarryNeeded = Math.floor( (perTripE / 50) / maxCreeps );
        let perCreepMoveNeeded  = Math.ceil( perCreepCarryNeeded / 2);

        while( (perCreepCarryNeeded + perCreepMoveNeeded) > 50){
            maxCreeps++;
            perCreepCarryNeeded = Math.floor( (perTripE / 50) / maxCreeps );
            perCreepMoveNeeded  = Math.ceil( perCreepCarryNeeded / 2);
        }

        /*
        console.log('CTRL MOVE');
        console.log(' room='+hRoom.name);
        console.log(' multiplier = '+multiplier);
        console.log(' perTripE = '+perTripE);
        console.log(' carryNeeded = '+carryNeeded);
        console.log(' moveNeeded  = '+moveNeeded);
        console.log(' maxCreeps   = '+maxCreeps);
        console.log(' perCreepCarry = '+perCreepCarryNeeded);
        console.log(' perCreepMove = '+perCreepMoveNeeded);
        */

        let cost = 50*(perCreepMoveNeeded+perCreepCarryNeeded);
        let body  = [];
        for(let bi=0; bi<perCreepCarryNeeded; bi++)
            body.push(CARRY);
        for(let bi=0; bi<perCreepMoveNeeded; bi++)
            body.push(MOVE);

        // Wait for it, if not yet available.
        if(hRoom.energyAvailable < cost)
            return true;

        // Find a free name and spawn the bot.
        // We need one instance per source, so this is pretty easy.  Do
        // enable alts.
        // TBD For alt time, this is basically 50.  Probably want to revisit that
        // for remote haresters, and add at least an additional 50 given they
        // will be lower in spawn order and have longer to travel...
        let altTime = (body.length*3)+20;
        let crname = Creep.spawnCommon(spawn, 'ctrlmov', body, maxCreeps, altTime, null);

        // If null, we hit max creeps.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];
        crmem.state     = 'moveHpos';
        crmem.pathLen   = path.length;
        delete crmem.instance;
        return true;
    };


    // Logic callback invoked to have a creep run it's actions - derived from
    // base Creep class (a 'virtual function' or whatever you call it in JS).
	runLogic()
	{
	    let crmem = this.m_crmem;
	    let creep = this.m_creep;
	    let rObj   = RoomHolder.get(creep.room.name);
	    let hRoom  = Game.rooms[crmem.homeName];
	    let hrObj  = RoomHolder.get(hRoom.name);
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
	    let debug="";
	    let cnt;

	    // Defence.. tbd to move into common logic
	    if(rObj.m_rmem.hostileCt > 0 ){
	        let towers = hrObj.getTowers();
	        if(towers && towers.length)
	            this.actMoveTo(towers[0]);
	        else
	            this.actMoveTo(hrObj.getSpawns()[0]);
	        this.clearTarget();
	        crmem.state = 'moveHpos';
	        return;
	    }

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            switch(crmem.state){

            case 'moveHpos':
                let storage = hrObj.getSpawnStorage();
                rc=this.actionMoveToPos(storage.pos);
                if(rc == OK) {
                    crmem.state = 'pickEnergy';
                    break;
                }
                return;

            case 'pickEnergy':
                let dropped = rObj.getDroppedResources();
                if(dropped && dropped.length > 0){
                    let di;
                    let drop;
                    for(di=0; di<dropped.length; di++){
                        drop = dropped[di];
                        if(creep.pos.getRangeTo(drop.pos) <= 4
                           && drop.resourceType == RESOURCE_ENERGY){
                            this.setTarget(drop);
                            crmem.state = 'getDropped';
                            break;
                        }
                    }
                    if(di != dropped.length)
                        break;
                }

                let sto = hrObj.getSpawnStorage();
                let trm = hrObj.getTerminal();
                let both = [];
                if(!sto) return;

                if(sto.store.energy > creep.carryCapacity)
                    both.push(sto);
                if(trm && trm.store.energy > creep.carryCapacity)
                    both.push(trm);
                let which = creep.pos.findClosestByPath(both);
                if(!which){
                    if(creep.pos.getRangeTo(sto)>6)
                        this.actMoveTo(sto);
                    else
                        creep.move(Math.floor(9*Math.random()));
                    return;
                }
                this.setTarget(which);
                crmem.state = 'withdrawStruct';
                break;

            case 'getDropped':
                rc=this.pickupDropped(RESOURCE_ENERGY);
                if(rc == ERR_FULL){
                    crmem.state = 'moveToStructure';
                    break;
                }
                if(rc == OK)
                    return;
                crmem.state = 'pickEnergy';
                if(rc == ERR_NOT_ENOUGH_RESOURCES || rc == ERR_NO_PATH)
                    return;
                break;

            case 'withdrawStruct':
                rc=this.withdrawStruct(RESOURCE_ENERGY);
                if(rc == ERR_FULL){
                    crmem.state = 'pickFill';

                    // We just filled, and will now embark on trip to controller
                    // container.  However, before we do, we still have a chance
                    // of putting goods back if we won't make it.
                    if(crmem.pathLen && creep.ticksToLive < crmem.pathLen){
                        let sto = hrObj.getSpawnStorage();
                        this.setTarget(sto);
                        crmem.state = 'recycle';
                    }
                    break;
                }
                if(rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    // target is cleared so we do need to re-pick.
                    crmem.state = 'pickEnergy';
                    return;
                }
                if(rc == ERR_NO_PATH){
                    crmem.state = 'pickEnergy';
                    return;
                }
                crmem.state = 'pickEnergy';
                break;

            case 'pickFill':
                cnt = hrObj.getControllerContainer();
                if(!cnt)
                    return;

                crmem.state = 'moveToStructure';
                break;

            case 'moveToStructure':
                cnt = hrObj.getControllerContainer();
                if(!cnt)
                    return;
                rc=this.actionMoveToPos(cnt.pos,2);
                if(rc != OK)
                    return;

                if(hrObj.m_room.controller.level == 8 || _.sum(cnt.store) == cnt.storeCapacity){
                    let creeps=hrObj.getFriendlies();
                    let upg;
                    let crCd;
                    for(let ci=0;ci<creeps.length;ci++){
                        let crCd = creeps[ci];
                        if(crCd.memory.role == 'ctrlupg' && crCd.pos.getRangeTo(cnt)<=5
                           && _.sum(crCd.carry) < (crCd.carryCapacity-15)
                           && ( !upg || _.sum(crCd.carry) < _.sum(upg.carry) ) ){
                            upg = crCd;
                        }
                    }

                    if(upg){
                        this.setTarget(upg);
                        crmem.state = 'fillTarget';
                        break;
                    }
                    else {
                        this.setTarget(cnt);
                        crmem.state = 'fillTarget';
                    }
                }
                else {
                    this.setTarget(cnt);
                    crmem.state = 'fillTarget';
                }
                break;
            case 'fillStructure':
                crmem.state = 'fillTarget';
                break;

            case 'fillTarget':
                rc=this.fillTarget(RESOURCE_ENERGY);
                if(rc == ERR_FULL){
                    if(creep.carry.energy > 0){
                        crmem.state = 'pickFill';
                        return;
                    }
                    else
                        crmem.state = 'pickEnergy';
                    break;
                }
                if(rc == OK){
                    // If our target is a creep, we're filling the ctrl upgrader.  If it's
                    // near capacity (minus what it used in one turn), then just move extras
                    // to the container.
                    let tgt = this.getTarget();
                    if(tgt && tgt.carry && _.sum(tgt.carry) >= (tgt.carryCapacity-15)){
                        this.clearTarget();
                        crmem.state = 'pickFill';
                    }
                    return;
                }
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    crmem.state = 'pickEnergy';
                    break;
                }
                if(creep.carry.energy == 0){
                    crmem.state = 'pickEnergy';
                    break;
                }
                crmem.state = 'pickFill';
                break;

            case 'recycle':
                // Called when we near death.  Drop any remaining energy in storage
                // (we generally should get here when we're right next to storage), and then
                // saunter to our culling.
                if(_.sum(creep.carry) > 0){
                    rc=this.fillTarget(RESOURCE_ENERGY);
                    return;
                }
                else {
                    let spawns = hrObj.getSpawns();
                    if(spawns && spawns.length > 0){
                        if(spawns[0].pos.getRangeTo(creep.pos) <= 1){
                            spawns[0].recycleCreep(creep);
                            return;
                        }
                        else{
                            this.actMoveTo(spawns[0]);
                            return;
                        }
                    }
                }
                break;


            default:
                console.log('BUG! Unrecognized creep state='+crmem.state+' for creep='+creep.name);
                crmem.state = 'pickEnergy';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);
	}
}

module.exports = Role_CtrlMover;
