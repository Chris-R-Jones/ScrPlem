
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Fat CARRY creep that just moves resources from host room to new
// bootstrapping room, to feed bootstrappers in early construction til
// the room is self-sufficient..
class Role_BootMover extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, hrObj, hostRoomName, targetRoomName, maxCreeps ) {
        let hRoom        = spawn.room;
        let tRoom        = Game.rooms[targetRoomName];
        let trObj        = RoomHolder.get(targetRoomName);
        let controller   = hRoom.controller;
        let si;

        // Filter if we want to control what rooms host the new room, else
        // just past null.
        if(hostRoomName && spawn.room.name != hostRoomName)
            return false;

        // Don't bootstrap from the room we're bootstrapping ;-)
        if(controller.level < 5)
            return false;

        // Get storage or container nearest to spawns.
        let spStorage = hrObj.getSpawnStorage();
        if(!spStorage)
            return false;

        // Make sure target room has a container to store into.
        // If not, we'll have to wait for bootstrappers to build from
        // harvested energy.
        if(!trObj || !trObj.m_room)
            return false;
        let trContainers = trObj.getContainers();
        if(!trContainers || trContainers.length < 1){
            return false;
        }

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
        let altTime = 300;
        let crname = Creep.spawnCommon(spawn, 'bootmove', body, maxCreeps, altTime, "", targetRoomName);

        // If null, we hit max creeps.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];

        crmem.tRoomName = targetRoomName;
        crmem.state     = 'moveHome';

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
        let rObj   = RoomHolder.get(creep.room.name);
        let containers;
        let container;
        let rc;
        let maxLoop = 5;
        let exceed;
        let si;
        let debug="";


        // Defence.. tbd to move into common logic
        if( rObj.m_rmem.hostileCt > 0 || trObj.m_rmem.hostileCt > 0 ){
            // Remote bootstrap defence is a little different than most.
            // In most cases we happened upon a hostile sector.  Something
            // routing probably should have avoided, but it's better to
            // run through than to keep bouncing back toward home (possibly very far away)
            // and the hostile sector we'll just get routed to again.
            if (rObj.m_room.name == crmem.tRoomName){
                // If we are at target, it's hostile, so we actually do want to
                // retreat home here.
                this.actionMoveToRoomRouted(crmem.homeName);
                if(crmem.state != 'moveTgtRoom'){
                    this.clearTarget();
                    crmem.state = 'moveTgtRoom';
                }
            }
            else {
                // We aren't to target yet and are in a hostile room, or
                // we are headed to a hostile target.  Either way, keep on
                // truckin.
                this.actionMoveToRoomRouted(crmem.tRoomName);
                if(crmem.state != 'moveTgtRoom'){
                    this.clearTarget();
                    crmem.state = 'moveTgtRoom';
                }
                return;
            }

            return;
        }

        for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'bootmove_W11N22_W14N21_2')
            //    console.log(Game.time+': '+creep.name+' loop='+exceed+' state='+crmem.state);
            switch(crmem.state){

            case 'moveHome':
                rc = this.actionMoveToRoomRouted(crmem.homeName);
                if(rc == OK) {
                    crmem.state = 'pickEnergy'
                    break;
                }
                return;

            case 'pickEnergy':
                this.setTarget(hRoom.storage);
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
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    if(_.sum(creep.carry) == creep.carryCapacity
                       || creep.room.name == crmem.tRoomName)
                        crmem.state = 'moveTgtRoom';
                    else {
                        crmem.state = 'pickEnergy';
                    }
                    return;
                }
                crmem.state = 'pickEnergy';
                return;

            case 'moveTgtRoom':
                rc = this.actionMoveToRoomRouted(crmem.tRoomName);
                if(rc == OK) {
                    crmem.state = 'pickFill';
                    break;
                }
                return;

            case 'pickFill':
                if(creep.room.name != crmem.tRoomName){
                    crmem.state = 'moveTgtRoom';
                    break;
                }

                // Once we've build storage, we want to fill/sacrifice only.
                let spStorage = trObj.getSpawnStorage();
                if(!spStorage)
                    return;

                if(spStorage.structureType == STRUCTURE_STORAGE && spStorage.my){
                    this.setTarget(spStorage);
                    crmem.state = 'fillStructure';
                    break;
                }

                // Otherwise, fill controller container -- if it exists
                // we're pretty controller upgrade focused.
                container = trObj.getControllerContainer();
                if(!container)
                    container = spStorage;
                if(container){
                    if(creep.pos.getRangeTo(container)<=5 &&
                       _.sum(container.store) == container.storeCapacity
                       ){
                        let creeps=trObj.getFriendlies();
                        let upg;
                        let crCd;
                        for(let ci=0;ci<creeps.length;ci++){
                            let crCd = creeps[ci];
                            if(crCd.memory.role == 'ctrlupg' && crCd.pos.getRangeTo(container)<=5
                               && _.sum(crCd.carry) < (crCd.carryCapacity-15)
                               && ( !upg || _.sum(crCd.carry) < _.sum(upg.carry) ) ){
                                upg = crCd;
                            }
                        }
                        if(upg){
                            this.setTarget(upg);
                            crmem.state = 'fillStructure';
                            break;
                        }
                    }
                    this.setTarget(container);
                    crmem.state = 'fillStructure';
                    break;
                }
                return;

            case 'fillStructure':
                rc=this.fillTarget(RESOURCE_ENERGY);
                if(rc == OK){
                    // If we're filling a creep and it's at capacity, pick new target.
                    let tgt = Game.getObjectById(crmem.targetId);
                    if(tgt && tgt.carry && _.sum(tgt.carry) >= (tgt.carryCapacity-15)){
                        this.clearTarget();
                        crmem.state = 'pickFill';
                    }
                    return;
                }
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    crmem.state = 'longHaulRecycle';
                    break;
                }
                else if (rc == ERR_FULL){
                    crmem.state = 'pickFill';
                    return;
                }
                if(creep.carry.energy == 0){
                    crmem.state = 'moveHome';
                }
                else{
                    crmem.state = 'pickFill';
                }
                break;

            case 'getDropped':
                rc=this.pickupDropped(RESOURCE_ENERGY);
                if(rc == ERR_FULL){
                    crmem.state = 'pickFill';
                    break;
                }
                if(rc == OK)
                    return;
                crmem.state = 'longHaulRecycle';
                if(rc == ERR_NOT_ENOUGH_RESOURCES || rc == ERR_NO_PATH)
                    return;
                break;

            case 'getTomb':
                // Only get energy.  We're booting a room, and there's a good chance we
                // don't have a place to put resources yet.  We certainly don't need to
                // optimize resource preservation.  Further, we often offload to creeps and
                // don't want to give them minerals.
                rc=this.pickupTomb(RESOURCE_ENERGY);
                if(rc == ERR_FULL){
                    crmem.state = 'pickFill';
                    break;
                }
                if(rc == OK)
                    return;
                crmem.state = 'longHaulRecycle';
                if(rc == ERR_NOT_ENOUGH_RESOURCES || rc == ERR_NO_PATH)
                    return;
                break;

            case 'longHaulRecycle':
                if(_.sum(creep.carry) > 0){
                    crmem.state = 'pickFill';
                    break;
                }

                let dropped = trObj.getDroppedResources();
                if(dropped && dropped.length > 0){
                    let di;
                    let drop;
                    for(di=0; di<dropped.length; di++){
                        drop = dropped[di];
                        if(creep.pos.getRangeTo(drop.pos) <= 10
                           && drop.resourceType == RESOURCE_ENERGY){
                            this.setTarget(drop);
                            crmem.state = 'getDropped';
                            break;
                        }
                    }
                    if(di != dropped.length)
                        break;
                }

                let tombs = trObj.getTombstones();
                if(tombs && tombs.length > 0){
                    let ti;
                    for(ti=0; ti<tombs.length; ti++){
                        let tomb = tombs[ti];

                        // Deal only with tombs storing energy.  We tend to distribute
                        // to control containers and early on may not have mineral storage.
                        // So don't deal with minerals.
                        // Go after it if we get more out of it than about 10
                        // energy per turn
                        if(tomb.store.energy >= 10*creep.pos.getRangeTo(tomb.pos)){
                            this.setTarget(tomb);
                            crmem.state = 'getTomb';
                            break;
                        }
                    }
                    if(ti != tombs.length)
                        break;
                }


                container = trObj.getSpawnStorage();
                if(container){
                    if(container.structureType == STRUCTURE_STORAGE && !container.my){
                        this.setTarget(container);
                        crmem.state = 'withdrawStruct';
                        break;
                    }
                    this.setTarget(container);
                    crmem.state = 'longHaulRecycleMove';
                }
                break;

            case 'longHaulRecycleMove':
                let target = Game.getObjectById(crmem.targetId);
                let spawn = trObj.findTopLeftSpawn();

                if(!spawn || !(spawn.my))
                    return;

                // Generally we're bootstrapping at levels
                // that have containers.  But if we're manually pumping a L5 room
                // we need special behavior and can't suicide directly into storage
                // so just suicide next to it..
                if(target.structureType == STRUCTURE_STORAGE){

                    if(!target.my){
                        // Looting someone's structure --- and it's not next to spawn.
                        this.setTarget(target);
                        crmem.state = 'withdrawStruct';
                        break;
                    }

                    if(creep.pos.getRangeTo(target) == 1 && creep.pos.getRangeTo(spawn) == 1){
                        spawn.recycleCreep(creep);
                    }
                    this.actMoveTo(target.pos.x-1,target.pos.y)
                    return;
                }

                // Otherwise it's a container, die directly on it.
                if(creep.pos.x != target.pos.x || creep.pos.y != target.pos.y){
                    this.actMoveTo(target.pos);
                    return;
                }

                if(target.store.energy >= 300){
                    if(trObj.getControllerContainer()){
                        // If we can't reccyel without overfilling, move some of the energy to
                        // controller container if there is one, which may free some room
                        // to die and get it where it needs to be.
                        this.setTarget(target);
                        crmem.state = 'withdrawStruct';
                    }
                    return;
                }
                spawn.recycleCreep(creep);
                return;

            default:
                console.log('BUG! Unrecognized creep state='+crmem.state+' for creep='+creep.name);
                crmem.state = 'moveHome';
                break;
            }
        }
        if(exceed == maxLoop)
            console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);
    }
}

module.exports = Role_BootMover;
