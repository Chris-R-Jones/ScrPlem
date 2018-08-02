var Preference      = require('Preference');
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Creep focused on upgrading the controller.
// Since controller upgrades are really just 1 E per WORK pre turn,
// they don't need much other than WORK and a little CARRY.
// As such they're built to get to controller slowly, and then stay there
// upgrading.

class Role_CtrlUpgrade extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };


    // Helper to find lab to boost a certain body part for this creep
    findLabForBoost(crObj, part)
    {
        let boost;
        if(part != WORK)
            return null;

        let labs = crObj.getLabs();
        for(let li=0; li<labs.length; li++){
            let lab = labs[li];
            if(   (lab.mineralType == 'GH' || lab.mineralType == 'GH2O' || lab.mineralType == 'XGH2O' )
               && (lab.mineralAmount >= 30)
               && (lab.energy >= 600)
               )
               return lab;
        }

        return null;
    }

    static spawn( spawn, hrObj, targetRoomName, spawnLimit ) {
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

        // For every 25000 energy in storage, we spawn 5x of WORK in our
        // upgraders.  So, 5E per turn.
        // Note that the CtrlMover role has similar logic for moving energy
        // to the controller container at similar rate (so consider that in any)
        // tuning done here.
        // Both this creep and the upgrader are moderated over time by the storage level.
        // If they aren't moving/upgrading fast enough, storage energy levels will
        // grow, and they allocate another 5 WORK and associated energy movement.

        let multiplier;
        if(spStorage.structureType == STRUCTURE_CONTAINER)
            multiplier = 5;
        else
            multiplier = Math.max(1,spStorage.store.energy / 20000);

        // Note I've not included carry in the move calc, as we're arriving empty.
        let workNeeded = Math.floor(multiplier*5);
        let carryNeeded = Math.ceil(workNeeded/5);
        let moveNeeded = Math.ceil(workNeeded/4);
        let totalCost = (carryNeeded*50 + moveNeeded*50 + workNeeded*100);
        let maxCreeps = Math.ceil(totalCost / hRoom.energyCapacityAvailable);

        let perCreepWorkNeeded = Math.floor( workNeeded / maxCreeps );
        let perCreepCarryNeeded = Math.ceil( perCreepWorkNeeded / 5);
        let perCreepMoveNeeded  = Math.ceil( perCreepWorkNeeded / 4);

        while( (perCreepWorkNeeded + perCreepCarryNeeded + perCreepMoveNeeded)
               > 50
             ){
            maxCreeps++;
            perCreepWorkNeeded = Math.floor( workNeeded / maxCreeps );
            perCreepCarryNeeded = Math.ceil( perCreepWorkNeeded / 5);
            perCreepMoveNeeded  = Math.ceil( perCreepWorkNeeded / 4);
        }

        // At level 8, we're limited to 15 E per turn.  Make that happen.
        let altTime;
        if(controller.level == 8){
            workNeeded = perCreepWorkNeeded = 15;
            carryNeeded = perCreepCarryNeeded = 25;
            moveNeeded = perCreepMoveNeeded  = 10;
            totalCost = (carryNeeded*50 + moveNeeded *50 + workNeeded*100);
            maxCreeps = 1;
            altTime = 150;
        }
        else {
            altTime = 0;
        }

        // If we're bootstrapping someone save our efforts for that room.
        if(Preference.bootEnabled && (Preference.hostRooms.indexOf(hRoom.name) > -1)){
            maxCreeps = 1;
        }
        if(spawnLimit && maxCreeps > spawnLimit)
            maxCreeps = spawnLimit;

        /*
        console.log('CTRL upgrade');
        console.log(' room='+hRoom.name);
        console.log(' multiplier = '+multiplier);
        console.log(' totalCost =  '+totalCost);
        console.log(' eCapacity = '+hRoom.energyCapacityAvailable);
        console.log(' maxCreeps =  '+maxCreeps);
        console.log(' workNeeded=  '+workNeeded);
        console.log(' perCreepWorkNeeded = '+perCreepWorkNeeded);
        console.log(' perCreepCarryNeeded = '+perCreepCarryNeeded);
        console.log(' perCreepMoveNeeded = '+perCreepMoveNeeded);
        */

        let cost = (50*perCreepCarryNeeded + 50*perCreepMoveNeeded+ 100*perCreepWorkNeeded);
        let body  = [];
        for(let bi=0; bi<perCreepWorkNeeded; bi++)
            body.push(WORK);
        for(let bi=0; bi<perCreepCarryNeeded; bi++)
            body.push(CARRY);
        for(let bi=0; bi<perCreepMoveNeeded; bi++)
            body.push(MOVE);

        // Wait for it, if not yet available.
        if(hRoom.energyAvailable < cost)
            return true;

        // Find a free name and spawn the bot.
        let crname = Creep.spawnCommon(spawn, 'ctrlupg', body, maxCreeps, altTime, null);

        // If null, we hit max creeps.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];
        crmem.state     = 'init';
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
	    let ctrlCon;
	    let bix;

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

            //if(creep.name == 'ctrlupg_E78S99_0')
            //    console.log(Game.time+' '+creep.name+ ' state='+crmem.state+' loop='+exceed);

            switch(crmem.state){
            case 'init':
                if(creep.room.controller.level == 8)
                    crmem.state = 'checkBoosts';
                else
                    crmem.state = 'moveHpos';
                break;

            case 'checkBoosts':

                for(bix=0; bix<creep.body.length; bix++){
                    if(creep.body[bix].type != WORK || creep.body[bix].boost)
                        continue;
                    if(!this.findLabForBoost(hrObj,creep.body[bix].type)){
                        //console.log(creep.name+' Missing boost for '+creep.body[bix].type);
                        crmem.state = 'moveHpos';
                        break;
                    }
                }
                crmem.state = 'applyBoosts';

                return;

            case 'applyBoosts':

                for(bix=0; bix<creep.body.length; bix++){
                    if(creep.body[bix].type != WORK || creep.body[bix].boost)
                        continue;
                    let lab = this.findLabForBoost(hrObj,creep.body[bix].type);
                    if(!lab){
                        //console.log(creep.name+ 'Missing boost for '+creep.body[bix].type+' in apply!!');
                        break;
                    }
                    if(creep.pos.getRangeTo(lab)>1)
                        this.actMoveTo(lab);
                    else{
                        console.log('Lab '+lab+' boosting creep '+creep.name+' with'+lab.mineralType);
                        lab.boostCreep(creep);
                    }
                    return;
                }
                crmem.state = 'moveHpos';
                break;

            case 'moveHpos':
                ctrlCon = hrObj.getControllerContainer();
                if(!ctrlCon)
                    return;
                rc=this.actionMoveToPos(ctrlCon.pos);
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

                ctrlCon = hrObj.getControllerContainer();
                if(!ctrlCon)
                    return;
                this.setTarget(ctrlCon);
                crmem.state = 'withdrawStruct';
                break;

            case 'withdrawStruct':
                rc=this.withdrawStruct(RESOURCE_ENERGY);
                if(rc == ERR_FULL){
                    this.setTarget(hRoom.controller);

                    if(!hRoom.controller.sign
                       || hRoom.controller.sign.text != Preference.signText
                       ){
                        crmem.state = 'signController';
                        break;
                    }
                    crmem.state = 'upgradeController';
                    break;
                }
                if(rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    // If we have at least some energy might as well
                    // upgrade while more arrives.  else
                    // targetId is cleared so we do need to re-pick.
                    if(creep.carry.energy > 0){
                        this.setTarget(hRoom.controller);
                        crmem.state = 'upgradeController';
                        break;
                    }
                    else{
                        crmem.state = 'pickEnergy';
                    }
                    return;
                }
                if(rc == ERR_NO_PATH){
                    crmem.state = 'pickEnergy';
                    return;
                }
                crmem.state = 'pickEnergy';
                break;

            case 'getDropped':
                rc=this.pickupDropped(RESOURCE_ENERGY);
                if(rc == ERR_FULL){
                    this.setTarget(hRoom.controller);
                    crmem.state = 'upgradeController';
                    break;
                }
                if(rc == ERR_NO_PATH){
                    let ctrlCon = hrObj.getControllerContainer();
                    if(!ctrlCon)
                        return;
                    this.setTarget(ctrlCon);
                    crmem.state = 'withdrawStruct';
                    break;
                }
                if(rc == OK)
                    return;
                crmem.state = 'pickEnergy';
                if(rc == ERR_NOT_ENOUGH_RESOURCES || rc == ERR_NO_PATH)
                    return;
                break;

            case 'signController':
                console.log('ctrlupgrade Signing in '+hRoom.name);
                if(hRoom.controller.pos.getRangeTo(creep.pos)>1){
                    this.actMoveTo(hRoom.controller);
                    return;
                }
                creep.signController(hRoom.controller, Preference.signText);
                crmem.state = 'upgradeController';
                return;

            case 'upgradeController':
                rc=this.upgradeController();
                debug=debug + '\t rc='+rc+'\n';
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    crmem.state = 'pickEnergy';
                    break;
                }
                if(rc == OK)
                    return;

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

module.exports = Role_CtrlUpgrade;
