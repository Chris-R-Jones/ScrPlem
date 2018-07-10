
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Optimized mover is a 'dumb' creep that just moves energy from dedicated
// harvest containers to the central spawn storage or container.
// (It's then distributed by a more intelligent mover at spawn).
// This reduces congestion around spawn, and allows us to only the amount of
// carry exactly needed for the long trek.

class Role_OptMover extends Creep
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
        let sources      = trObj.getSources();
        let controller   = hRoom.controller;
        let si;

        // Make sure room has reached L3 and at least 10 extensions.
        if(controller.level < 3)
            return false;

        if(controller.level == 3) {
            let exten = hrObj.getExtensions();
            if(exten.length < 10)
                return false;
        }

        // Get storage or container nearest to spawns, if not built yet
        // we're not ready/
        let spStorage = hrObj.getSpawnContainer();
        if(!spStorage)
            return false;

        // Don't move energy in neighbors if plan isn't complete. Repair bots need it
        // to build roads.   While it's tempting, don't do this at home.  If we're
        // not getting bootstrapped any longer, then this results in dead room.
        // Distributors need their energy from spawn storage.
        if(!trObj.m_rmem.lastPlanT && targetRoomName != spawn.room.name && ! trObj.isCenterRoom())
            return false;

        // Loop through sources, each one has its own distance and so
        // we need to treat each individually.
        for(si=0; si<sources.length; si++){
            let source = sources[si];

            let container = trObj.getDediHarvestContainer(hrObj, source);
            if(!container)
                continue;
            let ctpos = container.pos.x+'_'+container.pos.y;

            // See if we stored a source path for this source to that
            // container.
            let path = hrObj.getDediHarvPath(container);

            // Body needs to be just big enough to move energy from source
            // to spawn container at the same rate DediHarv generates it.
            // DediHarv generates 10 per turn  (except in source keeper rooms, where it's 14)
            // Two trips, plus two ticks of loadunload is:
            //  (2*pathLength)+2 ticks per load.
            // (Plus any rerouting time)
            // So, the mover needs to be able to carry the 10 times E that
            // is generated in that duration.

            let fullPathLen = path.length;
            if(targetRoomName != spawn.room.name){
                // TBD to do this right and calculate the remainder of the path length
                // but linkers will be handy here...
                fullPathLen += 25;
            }
            if(trObj.isCenterRoom())
                fullPathLen += 50;

            let perTurnE = 10;
            if(trObj.getLairs().length>0)
                perTurnE = 14;

            let perTripE = perTurnE*(2 * fullPathLen + 4);

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

            /*if(hRoom.name == 'E78S97' && source.pos.x == 18 && source.pos.y == 44){
                console.log('-----');
                console.log(' path length='+path.length);
                console.log(' tgtRoom ='+targetRoomName);
                console.log(' perTripE = '+perTripE);
                console.log(' carryNeeded = '+carryNeeded);
                console.log(' moveNeeded  = '+moveNeeded);
                console.log(' totalCost   = '+totalCost);
                console.log(' maxCreeps   = '+maxCreeps);
                console.log(' perCreepCarry = '+perCreepCarryNeeded);
                console.log(' perCreepMove = '+perCreepMoveNeeded);
            }*/

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
            let altTime = (body.length*3)+fullPathLen*2;
            let crname = Creep.spawnCommon(spawn, 'omover', body, maxCreeps, altTime, ctpos, targetRoomName);

            // If null, we hit max creeps.
            if(crname == null)
                continue;

            let crmem  = Memory.creeps[crname];

            // Initialze memory for the role.  Also assign a source position
            // from which to harvest, spreading bootstrappers evenly across the
            // harvest positions, based on their instance number.
            // ... TBD... I'm not sure sources is reliably ordered... need to keep
            // an eye out on this.... and perhaps add a sort here.  but it's not
            // our array to sort... (maybe rooms needs to sort it -- but as it comes
            // from find I'm not sure even room is allowed... TBD TBD).

            // Find the first harvest position for the assigned source.
            // (Where, we will build a container for holding proceeds).  Choose
            // the closest, and hopefully plains.
            let hp = trObj.getDediHarvestPosition(spawn, source);

            crmem.tRoomName = targetRoomName;
            crmem.srcX      = source.pos.x;
            crmem.srcY      = source.pos.y;
            crmem.ctrp      = {}
            crmem.ctrp.x    = container.pos.x;
            crmem.ctrp.y    = container.pos.y;
            crmem.state     = 'moveHpos';
            crmem.pathLen   = fullPathLen;

            // TBD - we don't need instance number after spawn logic is complete.
            // then again, leave it for now, just in case :)
            // delete crmem.instance
            return true;
        }
        return false;

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
	    let rObj   = RoomHolder.get(creep.room.name);
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
	    let debug="";

	    // Defence
	    if(this.commonDefence(creep, rObj, hrObj, trObj)){
	        crmem.state = 'moveHpos';
	        this.clearTarget();

            //if(creep.name == 'omover_W13N25_W14N25_5_420')
            //    console.log('T='+Game.time+creep.name+' common defence');

	        return;
	    }

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'omover_W14N21_36_120')
            //    console.log('T='+Game.time+creep.name+' pos='+creep.pos+' loop='+exceed+' state='+crmem.state);

            switch(crmem.state){

            case 'moveHpos':

                // We might get here after a defence mode reset while already carrying a load.
                // in that case, carry on to dest.
                if(_.sum(creep.carry) == creep.carryCapacity){
                    crmem.state = 'pickFill';
                    break;
                }

                if(!crmem.ctrp){
                    console.log(creep.name+' pos='+creep.pos+' BUG! Creep sad. No destination :( ');
                    creep.suicide();
                    return;
                }
                if(hRoom.name == crmem.tRoomName)
                    rc=this.actionMoveToCoord(crmem.ctrp.x, crmem.ctrp.y,null);
                else{
                    rc=this.actionMoveToCoord(crmem.ctrp.x, crmem.ctrp.y, crmem.tRoomName);
                }
                if(rc == OK) {
                    crmem.state = 'pickEnergy';
                    return;
                }
                else if (rc==ERR_BUSY){
                    return;
                }
                else{
                    debug=debug+'rc='+rc+'\n';
                }
                return;

            case 'pickEnergy':
                if(creep.room.name != crmem.tRoomName){
                    crmem.state = 'moveHpos';
                    break;
                }
                let spawn = hrObj.findTopLeftSpawn();

                if(!(trObj.m_room)){
                    crmem.state = 'moveHpos';
                    return;
                }

                let sources = trObj.getSources();
                let source;


                for(si=0; si<sources.length; si++){
                    if(sources[si].pos.x == crmem.srcX
                       && sources[si].pos.y == crmem.srcY)
                    {
                       source = sources[si];
                       break;
                    }
                }
                if(!source)
                    return;

                let container = trObj.getDediHarvestContainer(hrObj, source);
                if(!container){
                    // Container not built yet, need to wait.
                    return;
                }

                this.setTarget(container);
                crmem.state = 'withdrawStruct';
                break;

            case 'withdrawStruct':
                let tgt = Game.getObjectById(crmem.targetId);

                rc=this.withdrawStruct(RESOURCE_ENERGY);
                debug = debug + " rc= "+rc+"\n";

                if(rc == ERR_FULL || (tgt && tgt.store.energy < 15) || rc == ERR_NOT_ENOUGH_RESOURCES) {
                    // We filled but container is empty.  Generally we'll just
                    // start heading back.  But particularly in SK rooms, there
                    // tend to be dropped energy nearby (from dead keepers).
                    // And there can be quite a bit of it - helping to compensate from
                    // lost harvest time.  Go get it.
                    this.clearTarget();
                    if(_.sum(creep.carry) < creep.carryCapacity){
                        let dropped = trObj.getDroppedResources();

                        if(dropped && dropped.length > 0){
                            let di;
                            let drop;
                            for(di=0; di<dropped.length; di++){
                                drop = dropped[di];
                                if(creep.pos.getRangeTo(drop.pos) <= 6
                                   && drop.resourceType == RESOURCE_ENERGY){
                                    this.setTarget(drop);
                                    crmem.state = 'getDropped';
                                    return;
                                }
                            }
                        }
                    }

                    crmem.state = 'pickFill';
                    return;
                }
                if(rc == OK)
                    return;
                if(rc == ERR_NO_PATH){
                    crmem.state = 'pickEnergy';
                    return;
                }
                crmem.state = 'pickEnergy';
                break;

            case 'getDropped':

                if(_.sum(creep.carry) >= (creep.carryCapacity-100)){
                    this.clearTarget();
                    crmem.state = 'pickFill';
                    break;
                }

                // Note we generally get here after filling from struct
                // and so want to proceed to filling the home after a
                // best attempt to pickup.
                rc=this.pickupDropped(RESOURCE_ENERGY);
                if(rc == ERR_FULL){
                    crmem.state = 'pickFill';
                    break;
                }
                if(rc == OK)
                    return;
                crmem.state = 'pickFill';
                if(rc == ERR_NOT_ENOUGH_RESOURCES || rc == ERR_NO_PATH)
                    return;
                break;

            case 'pickFill':

                let spStorage = hrObj.getSpawnContainer();
                let trm;

                if(!spStorage)
                    return;
                trm = hrObj.getTerminal();

                if(!trm && _.sum(spStorage.store) == spStorage.storeCapacity){
                    if(spStorage.structureType == STRUCTURE_CONTAINER){
                        // We tend to glut the early rooms, move straight to controller.
                        let ctrlCtr = hrObj.getControllerContainer();

                        if(ctrlCtr && _.sum(ctrlCtr.store) < ctrlCtr.storeCapacity){
                            this.setTarget(ctrlCtr);
                            crmem.state = 'fillStructure';
                            break;
                        }
                        else if (ctrlCtr && creep.pos.getRangeTo(ctrlCtr) > 6)
                            creep.moveTo(ctrlCtr);
                    }
                    return;
                }

                if(trm && (trm.store[RESOURCE_ENERGY]*3 < spStorage.store[RESOURCE_ENERGY])){
                    this.setTarget(trm);
                }
                else
                    this.setTarget(spStorage);
                crmem.state = 'fillStructure';
                break;

            case 'fillStructure':
                rc=this.fillTarget(RESOURCE_ENERGY);
                debug = debug + " .. fillTarget rc="+rc+"\n";
                if(rc == OK)
                    return;
                if(rc == ERR_FULL){
                    crmem.state = 'pickFill';
                    return;
                }
                if(rc == ERR_NOT_ENOUGH_RESOURCES || creep.carry.energy == 0){
                    // We just filled, and will now embark on trip to back to
                    // energy source.  But if our life won't allow the roundtrip plus a little bit of
                    // routing contingency, then it's better to just recycle ourselves.
                    if(crmem.pathLen && creep.ticksToLive < ((2*crmem.pathLen)+15)){
                        crmem.state = 'recycle';
                        break;
                    }
                    crmem.state = 'pickEnergy';
                    break;
                }
                else{
                    crmem.state = 'pickFill';
                }
                break;

            case 'recycle':
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
                break;

            default:
                console.log('BUG! Unrecognized creep state='+crmem.state+' for creep='+creep.name);
                crmem.state = 'pickEnergy';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+'pos='+creep.pos+' exceeded max loops\n'+debug);
	}
}

module.exports = Role_OptMover;
