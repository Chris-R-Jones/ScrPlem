
var PathMaker       = require('PathMaker');
var Preference      = require('Preference');

//-------------------------------------------------------------
// Creep game/memory object analysis
//-------------------------------------------------------------

// Creep constructor.
// In the constructor we can store any anlysis that will not change, but
// be careful as these results aren't permanent -- anything that may
// change at all should be stored by refresh.
function Creep (creep, crmem) {
    this.refreshObj(creep, crmem);
};

// Object refresher
// Main function invoked once per tick to analyze an active creep
// object from Game.creeps and it's memory from Memory.creeps, storing analysis.
Creep.prototype.refreshObj = function(creep, crmem){
    this.m_creep = creep;
    this.m_crmem = crmem;
}

//-------------------------------------------------------------
// Creep 'main loop' logic callbacks.
//----------------------------------------------------------------------

// Logic callback invoked to have a creep run it's actions - to be derived
// by the creep role classes.
Creep.prototype.runLogic = function()
{
    console.log('BUG! Creep base class runLogic invoked for '+this.m_creep.name);
}


//----------------------------------------------------------------------
// Creep action helpers

// spawn helper, to decide name and spawn a creep.
// "static" function.
// Args:
//     altLife - ticks at which a creep's alternate should be spawned
//               to replace it.
Creep.spawnCommon = function( spawn, role, body, maxInstance, altLife, multiSpec,targetRoomName, homeName )
{
    let room = spawn.room;
    let name;
    let oname;
    let creep;
    let crmem;
    let ci;
    let s = '';

    let needDebug = false;

    // Find a name for creep,
    for(ci=0; ci<maxInstance; ci++){

        // The creep's home room is typically part of name, but if
        // multiple rooms can spawn the creep and we just need a fixed
        // number of them "global" can be specified so it's unique no
        // matter where it is spawned.
        if(!homeName && homeName != "global")
            homeName = room.name;

        oname = name = role+'_'
             + homeName+'_'
             + ( (!targetRoomName || targetRoomName == room.name)
                        ? ""
                        : targetRoomName+"_"
               )
             + (multiSpec ? multiSpec : "")+ci;
        altname = name+'_alt';

        if( false
            && (   oname == 'dharv_W5N8_0' || altname == 'dharv_W5N8_0_alt'
                || oname == 'dharv_W5N8_1' || altname == 'dharv_W5N8_1_alt'
            )
          ) {
            needDebug = true;
            s = 'DBG match name';
        }

        creep = Game.creeps[name];
        altcreep = Game.creeps[altname];

        if(!creep && !altcreep){
            if(needDebug){
                s = s + 'break no creep or altcreep\n';
                s = s + 'name='+name+'\n'
                s = s + 'altname='+altname+'\n';
                s = s + 'Game.creeps[name]='+Game.creeps[name]+'\n';
                s = s + 'Game.creeps[altname]='+Game.creeps[altname]+'\n';
            }
            break;
        }
        if(creep && altcreep){
            if(needDebug)
                s = s + '... Continue both exist\n';
            continue;
        }

        // One exists, see if it needs replacement.
        if(altLife == 0)
            continue;

        // Which lives, and what is the alternate name?
        if(creep)
            name = altname;
        else
            creep = altcreep;

        // Note in below - I've been seeing creeps that seem to be spawning but creep.spawning
        // is false... ticksToLive seems to be undefined though.   Found confirmation of this here:
        // https://screeps.com/forum/topic/443/creep-spawning-is-not-updated-correctly-after-spawn-process
        // This only affects private servers.
        //  I'm just assuming that if creep.ticksToLive is undefined it's spawning - I'm not sure I see a
        // case that would be untrue - if the creep object exists it should have a life of be spawning.
        if(creep.spawning || creep.ticksToLive === undefined || creep.ticksToLive > altLife ) {
            if(needDebug)
                s = s + '... Continue spawning='+creep.spawning+' ticks='+creep.ticksToLive+'\n';
            continue;
        }

        if(needDebug){
            s = s + '  ....'+'\n';
            s = s + '  creep='+creep+'\n';
            s = s + '  creep.name='+creep.name+'\n';
            s = s + '  name1='+oname+'\n';
            s = s + '  name2='+altname+'\n';
            s = s + '  creep1='+Game.creeps[oname]+'\n';
            s = s + '  creep2='+Game.creeps[altname]+'\n';
            s = s + '  altLife='+altLife+'\n';
            s = s + '   spawning='+creep.spawning+'\n';
            s = s + '   ttl='+creep.ticksToLive+'\n';
            s = s + '   altLife='+altLife+'\n';
        }

        break;
    }
    if( ci == maxInstance )
        return null;

    // Allocate memory & spawn it.
    crmem = { role: role, instance: ci, homeName: room.name };
    if(targetRoomName && targetRoomName != room.name)
        crmem.tRoomName = targetRoomName;
    rc = spawn.createCreep( body, name, crmem );
    if( rc != name ){
        // This shouldn't happen - beside the naming, the caller should have
        // done prechecks to prevent this...
        console.log('BUG! create creep returned error '+rc+' with name='+name
                   +'eAvail='+spawn.room.energyAvailable+' role='+role+' body='+body);
        return null;
    }

    if( needDebug ) {
        Memory.creeps[name].createDebug=s;
    }

    if(Preference.debugSpawns == true
       ||  Preference.debugSpawns == spawn.room.name ){
        console.log('T='+Game.time+' '+spawn.room.name+' spawned '+name);
    }

    // Note, we don't instantiate object here -- it'll get instantiated next
    // tick based on role, and since creep is spawning, there's otherwise no
    // immediate need.
    return name;
}

// Selects a target room object and stores target id for move to target.
Creep.prototype.setTarget = function( targetObj )
{
    let crmem = this.m_crmem;
    if(crmem.targetId)
        console.log(this.m_creep.name+', pos='+this.m_creep.pos+' :BUG! setting target when already set.. overwriting... state='+crmem.state);
    crmem.targetId = targetObj.id;
    if(crmem.mrpath)
        delete crmem.mrpath;

}

// Clears target -- usually unecessary as most routines will clear it when
// operation is completed -- but may be invoked if the creep knows it's terminating early.
Creep.prototype.clearTarget = function ()
{
    let crmem = this.m_crmem;
    delete crmem.targetId;
    delete crmem.mrpath;
}


// A common defence routine called by unarmed creeps to avoid hostiles and return
// home to support home, if necessary.
// Returns true if it takes control of the creep, in which case, the calling logic
// should generally reset the creep state to an initial state so that once defence
// logic is complete it can resume as normal.

Creep.prototype.commonDefence = function(creep, rObj, hrObj, trObj)
{
    // Return false if no need to defend
    if(creep.hits == creep.hitsMax
       && rObj.getHostiles().length == 0
       && (!trObj.m_rmem.hostileCt || trObj.m_rmem.hostileCt == 0)
       && !trObj.m_rmem.keeperRoom)
        return false;

    // If our current room isn't hostile we instead evaluate the target room, as we want
    // to determine if it's safe to enter.
    if(rObj.getHostiles().length == 0)
        rObj = trObj;

    let hostiles;
    if(rObj.m_room)
        hostiles=rObj.getHostiles();

    // We act differently depend on whether the room is full only of source keepers.
    // Determine if that's the case.
    let skOnly = true;
    if(rObj.m_room){
        for(let ti=0; ti<hostiles.length; ti++){
            let hCreep = hostiles[ti];
            if(hCreep.owner.username == "Source Keeper")
                continue;
            skOnly = false;
            break;
        }
    }
    else {
        let rmem = rObj.m_rmem;
        if(!rmem.keeperRoom || rmem.hostileOwner != 'Source Keeper')
            skOnly = false;
    }

    // If these aren't only source keepers, then retreat to home.
    if(!skOnly){
        if(creep.carryCapacity>0){
            delete creep.memory.targetId;
            if(_.sum(creep.carry)>0){
                if(_.sum(creep.carry) != creep.carry.energy){
                    let terminal = hrObj.getTerminal();
                    if(terminal)
                        this.setTarget(terminal);
                    else if (hrObj.getSpawnStorage())
                        this.setTarget(hrObj.getSpawnStorage());
                    else
                        return true;
                    this.fillTarget(null);
                    return true;
                }
                else {
                    // Pick a random tower and fill it.
                    let tower;
                    if(creep.memory.defenceTowerId){
                        tower = Game.getObjectById(creep.memory.defenceTowerId);
                    }
                    if(!tower){
                        let towers = hrObj.getTowers();
                        if(towers.length){
                            let tIdx = Math.floor(Math.random() * towers.length);
                            tower = towers[tIdx];
                            creep.memory.defenceTowerId = tower.id;
                        }
                    }
                    if(tower){
                        this.setTarget(tower);
                        this.fillTarget(RESOURCE_ENERGY);
                    }
                }
                return true;
            }
            else{
                let terminal = hrObj.getTerminal();
                let spsto = hrObj.getSpawnStorage();
                if(terminal && terminal.store.energy > creep.carryCapacity)
                    this.setTarget(terminal);
                else if (spsto && spsto.store.energy > creep.carryCapacity)
                    this.setTarget(hrObj.getSpawnStorage());
                else
                    return true;
                this.withdrawStruct(RESOURCE_ENERGY);
                return true;
            }
        }
        else {
            let safePoint = hrObj.getNuker();
            if(!safePoint){
                let towers = hrObj.getTowers();
                if(towers && towers.length)
                    safePoint = towers[0];
            }
            if(!safePoint){
                let spawns = hrObj.getSpawns();
                if(spawns.length)
                    safePoint = spawns[0];
            }
            if(safePoint)
                this.actMoveTo(safePoint);
        }
        return true;
    }
    else {
        // We know there are only source keepers, so generally we can go about our business,
        // unless one if them is near, in which case, we retreat til they don't pursue.

        // If we aren't in the room, just head toward it,
        if(!hostiles){
            return false;
        }

        // If we are near a lair, and that lair is about to spawn, then start heading home to
        // get out of way of impending creep.
        let needMove = false;
        let lairs = rObj.getLairs();
        let lair = creep.pos.findClosestByRange(lairs);
        if(lair && lair.ticksToSpawn && lair.ticksToSpawn <= 12)
            needMove = true;

        let hCreep = creep.pos.findClosestByRange(hostiles);
        if(!needMove && (! hCreep || hCreep.pos.getRangeTo(creep) > 8))
            return false;

        // If one is close, move toward home, but only as long as we're in that range.
        let towers = hrObj.getTowers();
        if(towers && towers.length)
            this.actMoveTo(towers[0]);
        else
            this.actMoveTo(hrObj.getSpawns()[0]);
        return true;
    }
    return true;
}


// Moves to and harvests energy from source (set by setTarget)
//   allowOvercommit - if true, we don't do a capacity check.
//                      (which generally means the harvester is sitting on a container
//                       and intends extras to drop in)
// Returns:
//   OK          - if in progress
//   ERR_FULL    - if creep was already at carry capacity.
//   ERR_INVALID - if target not set
//   ERR_NOT_ENOUGH_RESOURCES - target is out of energy.
//   ERR_NO_PATH - if no path from creep to target.
Creep.prototype.harvestSource = function( allowOvercommit )
{
    let crmem = this.m_crmem;
    let creep = this.m_creep;
    let target;
    let err;
    let rc;

    if(!allowOvercommit && _.sum(creep.carry) == creep.carryCapacity)
        err=ERR_FULL;
    else if(!crmem.targetId || !(target = Game.getObjectById(crmem.targetId)))
        err=ERR_INVALID_TARGET;
    else if(target.energy && target.energy == 0)
        err=ERR_NOT_ENOUGH_RESOURCES;
    else if(target.pos.getRangeTo(creep) >= 2){
        err=this.actionMoveToPos(target.pos);
        if(err != ERR_NO_PATH)
            return OK;
    }
    else {
        err=creep.harvest(target);
        if(!err)
            return OK;
    }

    if(crmem.targetId)
        delete crmem.targetId;
    if(crmem.targetPath)
        delete crmem.targetPath;
    return err;
}

// Moves to structure to withdraw designated resource
// Returns:
//   OK          - if in progress
//   ERR_FULL    - if creep was already at carry capacity.
//   ERR_INVALID - if target not set
//   ERR_NOT_ENOUGH_RESOURCES - target is out of energy.
//   ERR_NO_PATH - if no path from creep to target.
Creep.prototype.withdrawStruct = function( resource, amount )
{
    let crmem = this.m_crmem;
    let creep = this.m_creep;
    let target;
    let err = OK;
    let rc;

    if(!crmem.targetId || !(target = Game.getObjectById(crmem.targetId)))
        err=ERR_INVALID_TARGET;

    if(!err && resource == null){
        // Withdraw anything, so find what there is to withdraw.
        for( let rsc in target.store ){
            if(!target.store[rsc] || target.store[rsc] == 0)
                continue;
            else
                resource = rsc;
            break;
        }
        if(!resource)
            err = ERR_NOT_ENOUGH_RESOURCES;
    }
    else if( !err
             && ( (resource == RESOURCE_ENERGY && target.energy && target.energy == 0)
                  || (target.store && target.store[resource] == 0)
                )
           ){
        err = ERR_NOT_ENOUGH_RESOURCES;
    }

    if(!err){
        if(_.sum(creep.carry) == creep.carryCapacity)
            err=ERR_FULL;
        else if(target.pos.getRangeTo(creep) >= 2){
            err=this.actionMoveToPos(target.pos);
            if(err != ERR_NO_PATH)
                return OK;
        }
        else {
            if(amount)
                err=creep.withdraw(target, resource, amount);
            else
                err=creep.withdraw(target, resource);
            if(!err) {
                if(target.store && target.store.energy <= 10)
                    err = ERR_NOT_ENOUGH_RESOURCES;
                else
                    return OK;
            }
        }
    }

    if(crmem.targetId)
        delete crmem.targetId;
    if(crmem.targetPath)
        delete crmem.targetPath;
    return err;
}


// Moves to dropped resource to pickup
// Returns:
//   OK          - if in progress
//   ERR_FULL    - if creep was already at carry capacity.
//   ERR_INVALID - if target not set
//   ERR_NOT_ENOUGH_RESOURCES - target is out of energy.
//   ERR_NO_PATH - if no path from creep to target.
Creep.prototype.pickupDropped = function( resource )
{
    let crmem = this.m_crmem;
    let creep = this.m_creep;
    let target;
    let err;
    let rc;

    if(_.sum(creep.carry) == creep.carryCapacity)
        err=ERR_FULL;
    else if(!crmem.targetId || !(target = Game.getObjectById(crmem.targetId)))
        err=ERR_INVALID_TARGET;
    else if( (target.resourceType != resource && resource != null ))
        err=ERR_INVALID_TARGET;
    else if( (target.amount && target.amount == 0))
        err = ERR_NOT_ENOUGH_RESOURCES;
    else if(target.pos.getRangeTo(creep) >= 2){
        err=this.actionMoveToPos(target.pos);
        if(err != ERR_NO_PATH)
            return OK;
    }
    else {
        err=creep.pickup(target);
        if(!err)
            return OK;
    }

    if(crmem.targetId)
        delete crmem.targetId;
    if(crmem.targetPath)
        delete crmem.targetPath;
    return err;
}

// Moves to tombstone to pickup
// Returns:
//   OK          - if in progress
//   ERR_FULL    - if creep was already at carry capacity.
//   ERR_INVALID - if target not set
//   ERR_NOT_ENOUGH_RESOURCES - target is out of energy.
//   ERR_NO_PATH - if no path from creep to target.
Creep.prototype.pickupTomb = function( resource, amount )
{
    let crmem = this.m_crmem;
    let creep = this.m_creep;
    let target;
    let err = OK;
    let rc;

    if(!crmem.targetId || !(target = Game.getObjectById(crmem.targetId)))
        err=ERR_INVALID_TARGET;

    if(!err && resource == null){
        // Withdraw anything, so find what there is to withdraw.
        for( let rsc in target.store ){
            if(!target.store[rsc] || target.store[rsc] == 0)
                continue;
            else
                resource = rsc;
            break;
        }
        if(!resource)
            err = ERR_NOT_ENOUGH_RESOURCES;
    }
    else if( !err
             && ( (resource == RESOURCE_ENERGY && target.energy && target.energy == 0)
                  || (target.store && target.store[resource] == 0)
                )
           ){
        err = ERR_NOT_ENOUGH_RESOURCES;
    }

    if(!err){
        if(_.sum(creep.carry) == creep.carryCapacity)
            err=ERR_FULL;
        else if(target.pos.getRangeTo(creep) >= 2){
            err=this.actionMoveToPos(target.pos);
            if(err != ERR_NO_PATH)
                return OK;
        }
        else {
            if(amount)
                err=creep.withdraw(target, resource, amount);
            else
                err=creep.withdraw(target, resource);
            if(!err) {
                if(target.store && target.store.energy <= 10)
                    err = ERR_NOT_ENOUGH_RESOURCES;
                else
                    return OK;
            }
        }
    }

    if(crmem.targetId)
        delete crmem.targetId;
    if(crmem.targetPath)
        delete crmem.targetPath;
    return err;
}

// Moves to and upgrades controller
// Returns:
//   OK                        - if in progress
//   ERR_NOT_ENOUGH_RESOURCES  - creep is done, no energy.
//   ERR_INVALID_TARGET        - controller was never selected (generally shouldn't happen)
Creep.prototype.upgradeController = function( )
{
    let crmem = this.m_crmem;
    let creep = this.m_creep;
    let target;
    let err = OK;
    let rc;
    let range;

    if( creep.carry.energy == 0)
        err=ERR_NOT_ENOUGH_RESOURCES;
    else if(!crmem.targetId || !(target = Game.getObjectById(crmem.targetId)))
        err=ERR_INVALID_TARGET;
    else if((range=target.pos.getRangeTo(creep)) >= 3){
        this.actionMoveToPos(target.pos);
        if(range >= 4)
            return OK;
    }
    if(!err){
        err=creep.upgradeController(target);
        if(!err)
            return OK;
    }
    if(crmem.targetId)
        delete crmem.targetId;
    if(crmem.targetPath)
        delete crmem.targetPath;
    return err;
}

// Moves to and reserves controller
// Returns:
//   OK                        - if in progress
//   ERR_INVALID_TARGET        - controller was never selected (generally shouldn't happen)
Creep.prototype.actionReserveController = function( )
{
    let crmem = this.m_crmem;
    let creep = this.m_creep;
    let target;
    let err = OK;
    let rc;
    let range;

    if(!crmem.targetId || !(target = Game.getObjectById(crmem.targetId)))
        err=ERR_INVALID_TARGET;
    else if((range=target.pos.getRangeTo(creep)) >= 2){
        this.actionMoveToPos(target.pos);
        return OK;
    }
    if(!err){
        err=creep.reserveController(target);
        if(!err)
            return OK;
    }
    if(crmem.targetId)
        delete crmem.targetId;
    if(crmem.targetPath)
        delete crmem.targetPath;
    return err;
}


// Moves to and claims controller.  On error, will also try to reserve controller.
// Returns:
//   OK                        - if in progress
//   ERR_INVALID_TARGET        - controller was never selected (generally shouldn't happen)
Creep.prototype.actionClaimController = function( )
{
    let crmem = this.m_crmem;
    let creep = this.m_creep;
    let target;
    let err = OK;
    let rc;
    let range;

    if(!crmem.targetId || !(target = Game.getObjectById(crmem.targetId)))
        err=ERR_INVALID_TARGET;
    else if((range=target.pos.getRangeTo(creep)) >= 2){
        this.actionMoveToPos(target.pos);
        return OK;
    }
    if(!err){
        err=creep.claimController(target);
        if(!err)
            return OK;
        else
            creep.reserveController(target);
    }
    if(crmem.targetId)
        delete crmem.targetId;
    if(crmem.targetPath)
        delete crmem.targetPath;
    return err;
}


// Moves to and builds target site
// Returns:
//   OK                        - if in progress
//   ERR_NOT_ENOUGH_RESOURCES  - creep is done, no energy.
//   ERR_INVALID_TARGET        - site no longer exists (probably done) or not set correctly.
Creep.prototype.buildSite = function( )
{
    let crmem = this.m_crmem;
    let creep = this.m_creep;
    let target;
    let err;
    let rc;
    let range;


    if( creep.carry.energy == 0)
        err=ERR_NOT_ENOUGH_RESOURCES;
    else if(!crmem.targetId || !(target = Game.getObjectById(crmem.targetId))){
        err=ERR_INVALID_TARGET;
    }
    else if((range=target.pos.getRangeTo(creep)) >= 3){
        this.actionMoveToPos(target.pos);
        if(range >= 4)
            return OK;
    }
    else if( !target.my ){
        // Walk over
        this.actMoveTo(target);
        return OK;
    }
    if(!err){
        err=creep.build(target);
        if(err == ERR_INVALID_TARGET){
            // TBD this might be a creep sitting on the site.  Not real sure
            // how to deal with that. so far I've been manually killing them.
            // Here's a warning to help figure it out...
            console.log('Creep.build invalid target at '+target.pos+' warning! maybe a creep on it...')
        }
        if(!err)
            return OK;
    }
    if(crmem.targetId)
        delete crmem.targetId;
    if(crmem.targetPath)
        delete crmem.targetPath;
    return err;
}

// Moves to and repairs target struct
// Returns:
//   OK                        - if in progress
//   ERR_NOT_ENOUGH_RESOURCES  - creep is done, no energy.
//   ERR_INVALID_TARGET        - site no longer exists (probably done) or not set correctly.
Creep.prototype.repairStruct = function( )
{
    let crmem = this.m_crmem;
    let creep = this.m_creep;
    let target;
    let err;
    let rc;
    let range;

    if( creep.carry.energy == 0)
        err=ERR_NOT_ENOUGH_RESOURCES;
    else if(!crmem.targetId || !(target = Game.getObjectById(crmem.targetId)))
        err=ERR_INVALID_TARGET;
    else if((range=target.pos.getRangeTo(creep)) > 3){
        this.actionMoveToPos(target.pos);
        if(range >= 4)
            return OK;
    }
    else if( target.hits >= target.hitsMax ){
        // TBD -- should I return earlier than this if a repair will more than complete?
        // Would need counting WORK.
        err = ERR_INVALID_TARGET;
    }
    if(!err){
        err=creep.repair(target);
        //console.log(creep.name+': Repair action! T='+Game.time+' carryE='+creep.carry.energy+' target='+target+' hits='+target.hits+' '+' max='+target.hitsMax);
        if(!err)
            return OK;
    }
    if(crmem.targetId)
        delete crmem.targetId;
    if(crmem.targetPath)
        delete crmem.targetPath;
    return err;
}

// Moves to target and fills selected resources (or all carry if resources is null)
// into the target.
// Returns:
//   OK                        - if in progress
//   ERR_NOT_ENOUGH_RESOURCES  - creep is done, no resources.
//   ERR_INVALID_TARGET        - site no longer exists (probably done) or not set correctly.
Creep.prototype.fillTarget = function( resource )
{
    let crmem = this.m_crmem;
    let creep = this.m_creep;
    let target;
    let err = OK;
    let rc;
    let range;

    if(!resource){
        for ( let good in creep.carry ) {
            if (creep.carry[good] && creep.carry[good] != 0){
                resource = good;
                break;
            }
        }
    }

    if( !resource || creep.carry[resource] == 0 )
        err=ERR_NOT_ENOUGH_RESOURCES;
    else if(!crmem.targetId || !(target = Game.getObjectById(crmem.targetId)))
        err=ERR_INVALID_TARGET;
    else if(resource == RESOURCE_ENERGY
            && (
                   ( target.energy && target.energy == target.energyCapacity )
                || ( target.store  && _.sum(target.store) >= target.storeCapacity )
                || ( target.carry  && _.sum(target.carry) >= target.carryCapacity )
                )
        ) {
        // We won't be able to fill it, but we generally will still
        // want to move towrad it.  Return FULL to give decision back
        // whether to continue, but still move toward.
        //  this is important for some creeps to not crowd room
        // storage while waiting on dest.
        if(target.pos.getRangeTo(creep) > 1)
            this.actionMoveToPos(target.pos);
        err=ERR_FULL;
    }
    else if((range=target.pos.getRangeTo(creep)) >= 2){


        let rc = this.actionMoveToPos(target.pos);
        return OK;
    }

    if(!err){
        err=creep.transfer(target, resource);
        if(!err)
            return OK;
    }
    if(crmem.targetId)
        delete crmem.targetId;
    if(crmem.targetPath)
        delete crmem.targetPath;
    return err;
}


// At least initially, this has the exact same behavior as
// standard Creep.moveTo.  But I'm changing all calls to invoke
// this instead, so that I can later override behavior with my own
// implementation.
// For now - it's just calling Creep.moveTo directly.
Creep.prototype.actMoveTo = function(a1, a2, a3)
{
    let creep = this.m_creep;

    if(typeof a1 === 'RoomPosition'){
        let pos = a1;
        let opts = a2;
        if(opts)
            return creep.moveTo(pos,opts);
        else
            return creep.moveTo(pos);
    }
    else {
        let x = a1;
        let y = a2;
        let opts = a3;
        if(opts)
            return creep.moveTo(x,y,opts);
        else
            return creep.moveTo(x,y);
    }
}



// Moves to within range distance of a position in specified room.
// Arg:
//      x,y - target position
//      roomName - target room (or null for same room)
//      range - range of target position, or 1 by default.
// Returns:
//      OK                  - reached destination
//      ERR_BUSY            - moving in progress
//      ERR_NO_PATH         - couldn't find a path
//
// A bit like 'moveTo' but helps keep creep on target and allows a hook
// for me to optimize and simplify move logic for the calling code.
Creep.prototype.actionMoveToCoord = function( x, y, roomName, range )
{
    let creep = this.m_creep;
    let pos;

    if(!range && range != 0)
        range = 1;
    if(!roomName)
        roomName = creep.room.name;

    if( (creep.room.name == roomName )
        && Math.abs(x - creep.pos.x) <= range
        && Math.abs(y - creep.pos.y) <= range
      )
      return OK;

    let rc;
    if(!roomName || roomName == creep.room.name)
        rc=this.actMoveTo(x, y, { maxRooms: 1, reusePath: 5});
    else {
        pos = new RoomPosition(x,y, roomName);

        // OK, yes, it will get more complex, but to start, lets keep simple.
        // When changing consider the other actionMove routines too.
        rc=this.actMoveTo(pos, { reusePath: 5});
    }

    if(rc != ERR_NO_PATH)
        return ERR_BUSY;
    return rc;
}


// Moves to within 1 distance of a selected position.
// Arg:
//      pos - target position
// Returns:
//      OK                  - reached destination
//      ERR_BUSY            - moving in progress
//      ERR_NO_PATH         - couldn't find a path
//
// A bit like 'moveTo' but helps keep creep on target and allows a hook
// for me to optimize and simplify move logic for the calling code.
Creep.prototype.actionMoveToPos = function( pos, range )
{
    let creep = this.m_creep;
    let crmem = creep.memory;

    if(!range)
        range = 1;

    if(creep.pos.roomName != pos.roomName)
        return this.actionMoveToRoom(pos.roomName);

    if( creep.room.name == pos.roomName
        && Math.abs(pos.x - creep.pos.x) <= range
        && Math.abs(pos.y - creep.pos.y) <= range
      ){
        delete crmem.moveLastPos;
        delete crmem.moveNPCount;
        return OK;
    }

    if(crmem.amLastPos && creep.pos.x == crmem.amLastPos.x && creep.pos.y == crmem.amLastPos.y)
        crmem.moveNPCount = (crmem.moveNPCount ? crmem.moveNPCount+1 : 1);
    else{
        crmem.amLastPos=creep.pos;
        delete crmem.moveNPCount;
    }

    let reuseCount = 5;
    if(crmem.moveNPCount && crmem.moveNPCount > 5)
        reuseCount = 1;

    // OK, yes, it will get more complex, but to start, lets keep simple.
    // When changing consider the actionMoveToCoord too
    let rc=this.actMoveTo(pos, { maxRooms: 1, reusePath: reuseCount});

    if(rc != ERR_NO_PATH)
        return ERR_BUSY;
    return rc;
}

// Moves to room name passed in parameter.
// (At the moment, any way possible, not optimization for distance and not necessarily 'safe')
//
// Returns:
//      OK       - reached room and out of exit lane
//      ERR_BUSY - in progress
//      ERR_NO_PATH - couldn't get there.
Creep.prototype.actionMoveToRoom = function( roomName )
{
    let creep = this.m_creep;

    if(creep.room.name == roomName){
        if(creep.pos.x != 0
            && creep.pos.x != 49
            && creep.pos.y != 0
            && creep.pos.y != 49
            ) return OK;

        // Once in room move with ignoreDistructibles to try to find a position inside the entryway,
        // if there are creeps budleed up but also walls.
        let pos = new RoomPosition(25,25,roomName);
        let rc = this.actMoveTo(pos,{ reusePath: 0, ignoreDestructibleStructures: true});

        if(!rc)
            return ERR_BUSY;
        if(rc == ERR_NO_PATH){
            // Probably because we told it to move to a chunk of wall at 25,25.
            // The moveTo is better because it will avoid crowding entryway, but the real
            // need is to get out of edge, so... find out where we can go.
            // TBD. Honestly, this isn't perfect either... really should do lookAt to find another
            // free position in room.
            let x = creep.pos.x;
            let y = creep.pos.y;
            x = (x==0)?1:x;
            x = (x==49)?48:x;
            y = (y==0)?1:y;
            y = (y==49)?48:y;
            let dir = creep.pos.getDirectionTo(x, y);
            creep.move(dir);
        }
        return rc;
    }

    // Another one that needs significant work... but cheap and easy
    let pos = new RoomPosition(25,25,roomName);
    let rc = this.actMoveTo(pos,{ reusePath: 5 });

    if(!rc)
        return ERR_BUSY;
    return rc;
}


// Helper to the moveToRoom routines that moves a creep safely into out of
// exit lanes on arrival.
//  Returns:
//    OK - if creep is out of exit lane.
//    BUSY - if creep was instructed to move out of exit.
Creep.prototype.enterRoom = function ()
{
    let creep = this.m_creep;
    let crmem = creep.memory;

    if(creep.pos.x != 0
        && creep.pos.x != 49
        && creep.pos.y != 0
        && creep.pos.y != 49
        ) {
        return OK;
    }
    else {
        // Our normal move in this case would typically not ignore walls,
        // but we need to, to make sure we get into a safe place.
        let rc = this.actMoveTo(25,25,{ignoreDestructibleStructures: true});
        if(rc == ERR_NO_PATH){
            // Probably because we told it to move to a chunk of wall at 25,25.
            // The moveTo is better because it will avoid crowding entryway, but the real
            // need is to get out of edge, so... find out where we can go.
            // TBD. Honestly, this isn't perfect either... really should do lookAt to find another
            // free position in room.  Or look at Map which has a quick terrain query routine.
            let x = creep.pos.x;
            let y = creep.pos.y;
            x = (x==0)?1:x;
            x = (x==49)?48:x;
            y = (y==0)?1:y;
            y = (y==49)?48:y;
            let dir = creep.pos.getDirectionTo(x, y);
            creep.move(dir);
        }
        return ERR_BUSY;
    }
}

// Helper to the moveToRoom routine, that moves a creep by a saved PathFinder
// result.
Creep.prototype.moveByPathFinderResult = function ()
{
    let creep = this.m_creep;
    let crmem = creep.memory;

    if(!crmem.mrpath || crmem.mrpath.length < 1){
        delete crmem.mrpath;
        return;
    }

    let fPos = crmem.mrpath[0];

    if(fPos.x == creep.pos.x
       && fPos.y == creep.pos.y
       && fPos.roomName == creep.pos.roomName
      ) {
        let lPos = crmem.mrpath[0];
        let sPos = crmem.mrpath[1] ? crmem.mrpath[1] : null;
        let nPos = crmem.mrpath[2] ? crmem.mrpath[2] : null;

        crmem.mrpath.shift();

        if(crmem.mrFailCt)
            delete crmem.mrFailCt;

        if(crmem.mrpath.length == 0){
            //console.log(creep.name+ ' PATH COMPLETE!! '+creep.pos);
            delete crmem.mrpath;
            return ERR_BUSY;
        }

        if( Math.abs(lPos.x - sPos.x) > 1 || Math.abs(lPos.y - sPos.y) > 1 ){
            // When in the exit, and next turn is in the exit, do nothing to move, we
            // move automatically, lest we move out.
            return ERR_BUSY;
        }
        else {
            let dir = creep.pos.getDirectionTo(sPos.x, sPos.y);
            //console.log(creep.name+' moving direction '+dir);
            creep.move(dir);
            return ERR_BUSY;
        }
    }
    else {
        //console.log('T='+Game.time+' name='+creep.name+' No position match, fail='+crmem.mrFailCt);
        //console.log('....current='+creep.pos);
        //console.log('....pos[0] ='+JSON.stringify(crmem.mrpath[0]));
        //console.log('....pos[1] ='+JSON.stringify(crmem.mrpath[1]));
        //console.log('....pos[2] ='+JSON.stringify(crmem.mrpath[2]));
        if(!crmem.mrFailCt) {
            crmem.mrFailCt=1;
            return ERR_BUSY;
        }
        else {
            // Still try to move toward last position known.  Odds are we just got stalled behind
            // a creep. But if that fails for 10 turns just generate a new path.
            if(++crmem.mrFailCt == 10){
                //console.log('Deleting path to recover');
                delete crmem.mrFailCt;
                delete crmem.mrpath;
            }
            else {
                let sPos = crmem.mrpath[0];

                // Not sure we need this 'immediate recover' anymore, was mostly to chase a bug, but if for
                // any reason pathfinder gets totally whacked, this could help get out of it.
                if(crmem.mrFailCt > 3 && Math.abs(creep.pos.x - sPos.x) > 5 || Math.abs(creep.pos.y - sPos.y) > 5){
                    //console.log('.. triggering immediate recover.');
                    delete crmem.mrpath;
                    delete crmem.mrFailCt;
                    return ERR_BUSY;
                }

                if(Math.abs(creep.pos.x - crmem.mrpath[0].x) <= 2 && Math.abs(creep.pos.y - crmem.mrpath[0].y) <= 2 ){
                    //console.log('Trying to move out of it!');
                    let dir = creep.pos.getDirectionTo(sPos.x, sPos.y);
                    creep.move(dir);
                }
            }
        }
        return ERR_BUSY;
    }
}

// Moves to room name passed in parameter, avoiding hostile rooms.
// To be used only in cases where we are moving longer distances.  Creeps that
// do remote harvesting nearby in safe sectors should just use the unsafe version.
//
// Returns:
//      OK       - reached room and out of exit lane
//      ERR_BUSY - in progress
//      ERR_NO_PATH - couldn't get there.
Creep.prototype.actionMoveToRoomSafe = function( roomName )
{
    let creep = this.m_creep;
    let crmem = creep.memory;

    //console.log(creep.name+' T='+Game.time+' MTRSFDBG 1 roomName='+roomName+ ' pos='+creep.pos);

    // If we've reached destination, yipee
    if(creep.room.name == roomName){
        delete crmem.mrpath;
        return this.enterRoom();
    }

    // If we are still on a saved path, use it.
    if(crmem.mrpath){
        return this.moveByPathFinderResult();
    }

    let pfdebug;
    //if(creep.name == 'remoteBoot_W8N27_W4N21_3'){
    //    pfdebug = true;
    //    crmem.allowExplore = false;
    //}

    let pos = new RoomPosition(25,25,roomName);

    if(pfdebug) console.log(creep.name+' FINDING PATH '+creep.room.name+' -> '+roomName);

    let pfresult = PathFinder.search
        ( creep.pos
        , { pos: pos, range: 25 }
        ,   {
                // We need to set the defaults costs higher so that we
                // can set the road cost lower in `roomCallback`
                //
                // Unforuntately, there seems to be a bug with 2/5 plain/swamp cost where
                // it totally avoids rooms...
                plainCost: 1.1,
                swampCost: 3,
                maxRooms: 32,

                roomCallback: function(cbRoomName)
                {
                    let rmem = Memory.rooms[cbRoomName];
                    let room = Game.rooms[cbRoomName];
                    let costs;

                    // If we've never been there at all...
                    if(!rmem && !room){
                        // If it is our target room and we don't know about it,
                        // that's ok - we'll get there - return a blank cost matrix
                        if(cbRoomName == roomName){
                            let costs = new PathFinder.CostMatrix;
                            if(pfdebug) console.log('... '+cbRoomName+' blank matrix');
                            return costs;
                        }

                        // But any room that's on the way there we need to return false
                        // to limit the search and dangers.
                        if(!crmem.allowExplore){
                            if(pfdebug) console.log('... '+cbRoomName+' false not known');
                            return false;
                        }
                        else {
                            // If creep is an exploring creep, let them explore.
                            if(pfdebug) console.log('... '+cbRoomName+' blank permit explore');
                            return new PathFinder.CostMatrix;
                        }
                    }

                    // Avoid hostile rooms, unless it's our origin or destination
                    if((rmem.keeperRoom || rmem.hostileCt || rmem.hostileTowerCt)
                       && cbRoomName != creep.room.name
                       && cbRoomName != roomName){
                        if(pfdebug) console.log('... '+cbRoomName+' false hostile');
                        return false;
                    }

                    /*if(rmem.costMatrix) {
                        if ( !room || ( Game.time - rmem.costMatrixTime ) <= 100){

                            costs = PathFinder.CostMatrix.deserialize(rmem.costMatrix);

                            // Avoid creeps in the room (if we know room)
                            if(room){
                                room.find(FIND_CREEPS).forEach(function(creep) {
                                  costs.set(creep.pos.x, creep.pos.y, 0xff);
                                });
                            }
                            if(pfdebug) console.log('... '+cbRoomName+' existing matrix');
                            return costs;
                        }
                    }
                    */
                    costs = new PathFinder.CostMatrix;

                    // If we don't have vision return blank matrix (but dont' save it)
                    // We do at least know from memory it's not hostile.
                    if(!room) {
                        if(pfdebug) console.log('... '+cbRoomName+' no vision, blank matrix');
                        return costs;
                    }

                    room.find(FIND_STRUCTURES).forEach(function(struct) {
                      if (struct.structureType === STRUCTURE_ROAD) {
                        // Favor roads over plain tiles
                        costs.set(struct.pos.x, struct.pos.y, 1);
                      } else if (struct.structureType !== STRUCTURE_CONTAINER &&
                                 (struct.structureType !== STRUCTURE_RAMPART ||
                                  !struct.my)) {
                        // Can't walk through non-walkable buildings
                        costs.set(struct.pos.x, struct.pos.y, 0xff);
                      }
                    });

                    rmem.costMatrix = costs.serialize();
                    rmem.costMatrixTime = Game.time;

                    // Avoid creeps in the room
                    // (But note I'm doing this AFTER serializing.)
                    room.find(FIND_CREEPS).forEach(function(creep) {
                      costs.set(creep.pos.x, creep.pos.y, 0xff);
                    });

                    if(pfdebug) console.log('... '+cbRoomName+' new cost matrix');
                    return costs;
                }
            }
        );
    if(pfdebug && pfresult.incomplete){
        console.log(creep.name+' incomplete path '+creep.room.name+' -> '+roomName);
        console.log(creep.name+' current pos='+creep.pos);
        console.log(creep.name+' pathlen = '+pfresult.path.length);

        let lastRoom;
        for(let i=0; i<pfresult.path.length; i++){
            if(!lastRoom || pfresult.path[i].roomName != lastRoom){
                lastRoom = pfresult.path[i].roomName;
                console.log('... pfr['+i+']='+pfresult.path[i]);
            }
        }

    }

    // If the very first position is an exit lane, shift it out, because we'll actually be
    // there.
    if(pfresult.path && pfresult.path.length > 0){
        crmem.mrpath = pfresult.path;
        rc = creep.moveByPath(pfresult.path);

        let initialPos = pfresult.path[0];
        if(initialPos.x == 0 || initialPos.x == 49 || initialPos.y == 0 || initialPos.y == 49) {
            crmem.mrpath.shift();
        }
    }
    return ERR_BUSY;
}

// Moves to room name passed in parameter, prioritizing known safe rooms.
// To be used only in cases where we are moving longer distances.  Creeps that
// do remote harvesting nearby in safe sectors should just use the unsafe version.
//
// Returns:
//      OK       - reached room and out of exit lane
//      ERR_BUSY - in progress
//      ERR_NO_PATH - couldn't get there.
Creep.prototype.actionMoveToRoomRouted = function( roomName )
{
    let creep = this.m_creep;
    let crmem = creep.memory;

    let pfdebug;

    //if(true && creep.name == 'milOmni_E78S98_E74S91_0')
    //    pfdebug = true;

    if(pfdebug) console.log('------\n'+Game.time+': '+creep.name+' start debug dest='+roomName+' pos='+creep.pos+' mrpath='+crmem.mrpath);


    // If we've reached destination, yipee
    if(creep.room.name == roomName){
        if(pfdebug) console.log(creep.name+' reached dest room');

        delete crmem.mrpath;
        return this.enterRoom();
    }

    if(crmem.moveRoomDest && crmem.moveRoomDest != roomName){
        if(pfdebug) console.log(creep.name+' mismatch dest room');

        delete crmem.mrpath;
        delete crmem.mrroute;
    }
    crmem.moveRoomDest = roomName;

    // If we are still on a saved path, use it.
    if(crmem.mrpath && crmem.mrpath.length > 0){
        if(pfdebug) console.log(creep.name+' on saved path');
        return this.moveByPathFinderResult();
    }

    // We've lost our way (or never found it).  If we have a room route, see if we're on track,
    // else generate a new room route.
    let cRoomName = creep.room.name;
    if(crmem.mrroute){
        let ri;

        if(pfdebug) console.log(creep.name+' checking if on track');

        for(ri=0; ri<crmem.mrroute.length; ri++){
            if(crmem.mrroute[ri] == cRoomName)
                break;
        }
        if(ri == crmem.mrroute.length) {
            if(pfdebug) console.log(creep.name+' .. not on track');
            delete crmem.mrroute;
        }
        else{
            // Found our room ri entries deep, so remove the entries to that point.
            crmem.mrroute.splice(0,ri);
        }
    }

    let route = crmem.mrroute;
    if(!route){
        if(pfdebug) console.log(creep.name+' generating new room route');

        route = PathMaker.getSafeRoute( cRoomName, roomName );
        //console.log('Creep '+creep.name+' found route'+route);
        if(route == ERR_NO_PATH)
            return ERR_NO_PATH;
        crmem.mrroute = route;
    }


    // PathFinder is pretty borked for distance travel.  But does help to get
    // clean routes for a few rooms.  Never search more than 3 rooms ahead.
    // Find a path to middle of next room 3 ahead or final destination.
    // (within 23 of it, so we'll find at least something near edge then choose
    // new route)
    let pos;
    if(route.length < 4)
        pos = new RoomPosition(25,25,roomName);
    else
        pos = new RoomPosition(25,25,route[3]);
    if(pfdebug) console.log(creep.name+' FINDING PATH '+creep.room.name+' -> '+pos);

    let pfresult = PathFinder.search
        ( creep.pos
        , { pos: pos, range: 23 }
        ,   {
                // We need to set the defaults costs higher so that we
                // can set the road cost lower in `roomCallback`
                plainCost: 1.1,
                swampCost: 3,
                maxRooms: 32,

                roomCallback: function(cbRoomName)
                {
                    // PathFinder is pretty borked without at pretty legitimate set of rooms.
                    // Check if the search room is already on the room route found earlier.
                    let ri;
                    for(ri=0; ri < route.length; ri++){
                        if(cbRoomName == route[ri])
                            break;
                    }
                    if(ri == route.length){
                        if(pfdebug) console.log('... '+cbRoomName+' not on room route, return false.');
                        return false;
                    }

                    // It is, so now generate a cost matrix.
                    let rmem = Memory.rooms[cbRoomName];
                    let room = Game.rooms[cbRoomName];
                    let costs;

                    // Hopefully we have a matrix from a recent visit.
                    if(rmem && rmem.costMatrix) {
                        if ( !room || ( Game.time - rmem.costMatrixTime ) <= 100){

                            costs = PathFinder.CostMatrix.deserialize(rmem.costMatrix);

                            // Avoid creeps in the room (if we know room)
                            if(room){
                                room.find(FIND_CREEPS).forEach(function(creep) {
                                  costs.set(creep.pos.x, creep.pos.y, 0xff);
                                });
                            }
                            if(pfdebug) console.log('... '+cbRoomName+' existing matrix');
                            return costs;
                        }
                    }

                    // Else generate one.
                    costs = new PathFinder.CostMatrix;

                    // If we don't have vision return blank matrix (but dont' save it)
                    if(!room) {
                        if(pfdebug) console.log('... '+cbRoomName+' no vision, blank matrix');
                        return costs;
                    }

                    room.find(FIND_STRUCTURES).forEach(function(struct) {
                      if (struct.structureType === STRUCTURE_ROAD) {
                        // Favor roads over plain tiles
                        if(costs.get(struct.pos.x, struct.pos.y) < 1)
                            costs.set(struct.pos.x, struct.pos.y, 1);
                      } else if (struct.structureType !== STRUCTURE_CONTAINER &&
                                 (struct.structureType !== STRUCTURE_RAMPART ||
                                  !struct.my)) {
                        // Can't walk through non-walkable buildings
                        costs.set(struct.pos.x, struct.pos.y, 0xff);
                      }
                    });

                    room.find(FIND_CONSTRUCTION_SITES).forEach(function(site) {
                      if (site.structureType === STRUCTURE_ROAD) {
                        if(costs.get(site.pos.x, site.pos.y) < 1)
                            costs.set(site.pos.x, site.pos.y, 1);
                      } else if (site.structureType !== STRUCTURE_CONTAINER &&
                                 (site.structureType !== STRUCTURE_RAMPART ||
                                  !site.my)) {
                        // Can't walk through non-walkable buildingsites
                        costs.set(site.pos.x, site.pos.y, 0xff);
                      }
                    });

                    rmem.costMatrix = costs.serialize();
                    rmem.costMatrixTime = Game.time;

                    // Avoid creeps in the room
                    // (But note I'm doing this AFTER serializing.)
                    room.find(FIND_CREEPS).forEach(function(creep) {
                      costs.set(creep.pos.x, creep.pos.y, 0xff);
                    });

                    if(pfdebug) console.log('... '+cbRoomName+' new cost matrix');
                    return costs;
                }
            }
        );

    if(pfdebug) console.log(creep.name+' new route len='+pfresult.path.length+' incomplete = '+pfresult.incomplete);

    if(pfdebug && pfresult.incomplete){
        console.log(creep.name+' incomplete path '+creep.room.name+' -> '+roomName);
        console.log(creep.name+' current pos='+creep.pos);
        console.log(creep.name+' pathlen = '+pfresult.path.length);

        let lastRoom;
        for(let i=0; i<pfresult.path.length; i++){
            if(!lastRoom || pfresult.path[i].roomName != lastRoom){
                lastRoom = pfresult.path[i].roomName;
                console.log('... pfr['+i+']='+pfresult.path[i]);
            }
        }
    }

    // If the very first position is an exit lane, shift it out, because we'll actually be
    // there.
    if(pfresult.path && pfresult.path.length > 0){
        crmem.mrpath = pfresult.path;

        if(pfdebug) console.log('After set crmem.mrpath = '+crmem.mrpath);

        rc = creep.moveByPath(pfresult.path);

        let initialPos = pfresult.path[0];
        if(initialPos.x == 0 || initialPos.x == 49 || initialPos.y == 0 || initialPos.y == 49) {

            if(pfdebug) console.log(creep.name+' .. initial position in lane');


            crmem.mrpath.shift();


        }
    }
    return ERR_BUSY;
}

module.exports = Creep;
