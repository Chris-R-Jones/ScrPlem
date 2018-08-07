
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Dedicated harvester is a WORK focused build that just sits next to a
// source and harvests, transferring energy into container at the source
// for pickup.  It also builds & repairs the container (one of the few
// structures that isn't done by site planner -- partly because it can
// be built in a remote room).
//
// These harvesters can either be local to home room or remote, with
// very little difference.
//
// Dedicated harvesters are only spawned once a room reaches L3 with
// maxmium extensions built.  Prior to that the room must be bootstrapped.
// Ideally it also has roads.  Builds of roads might still be in progress.
// in that case, movement is slow for dharv (whose build does assume roads)
// but on the other hand, at that time bootstrappers are helping drain
// sources.

// L3, 10 extensions (when dediharvs are first kicked off) gives max 800 energy.
// It takes 5 WORK to fully drain a source, if it's perfect and harvests every turn.
// That's only possible if it doesn't have to skip a turn to transfer load.  This
// build assumes that (it drops extra into container except when first building that
// container).
// Note that 6x WORK COULD HAVE been possible at L3, with the following:
//   const BODY_M1 = [ WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE ];
//   const BODY_M1_COST = 800;
// We're just going to aim to do better.
const BODY_M1 = [ WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE ];
const BODY_M1_COST = 700;

// Body used when source keeper mining - slightly bigger WORK for slightly bigger
// source.
const BODY_SK_M2 = [ WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE, MOVE ];
const BODY_SK_M2_COST = 950;

// Big TBD -- once the container is built, there's no need for CARRY any longer.
// We could have a separate model that saves that part.  However, it does mean
// we need to check if all the containers exist *before* spawn, something that's
// awkward in our current flow...

class Role_DediHarv extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, hrObj, targetRoomName, trObj ) {
        let hRoom        = spawn.room;
        let tRoom        = Game.rooms[targetRoomName];
        let controller   = hRoom.controller;
        let body;
        let cost;

        // Make sure room has reached L3 and at least 8 extensions.
        if(controller.level < 3)
            return false;

        if(controller.level == 3) {
            let exten = hrObj.getExtensions();
            if(exten.length < 8)
                return false;
        }

        let lairCt = 0;
        lairCt = trObj.getLairs().length;

        // Choose the body we want and will wait for energy for.
        if( lairCt == 0 && hRoom.energyCapacityAvailable >= BODY_M1_COST ){
            body = BODY_M1;
            cost = BODY_M1_COST;
        }
        else if ( lairCt > 0 && hRoom.energyCapacityAvailable >= BODY_SK_M2_COST){
            body = BODY_SK_M2;
            cost = BODY_SK_M2_COST;
        }
        else {
            return true;
        }

        // Get storage or container nearest to spawns, if not built yet
        // we're not ready for remote harvesting.
        let spStorage = hrObj.getSpawnStorage();
        if(!spStorage && targetRoomName != spawn.room.name)
            return false;

        // Wait for it, if not yet available.   Arguably we shouldn't
        // return true here until we know the dediharv is needed.
        // On the other hand, 800 energy really isn't that much to ask for
        // so it's a somewhat reasonable block.
        // TBD to come back to this and search names in advance...
        // we'll need to do that with mover anyway, I suspect.
        if(hRoom.energyAvailable < cost)
            return true;

        // Find a free name and spawn the bot.
        // We need one instance per source, so this is pretty easy.  Do
        // enable alts.
        // TBD For alt time, this is basically 50.  Probably want to revisit that
        // for remote haresters, and add at least an additional 50 given they
        // will be lower in spawn order and have longer to travel...
        let sources = trObj.getSources();
        let altTime = (body.length*3)+20;
        let multispec = "" ;
        let crname = Creep.spawnCommon(spawn, 'dharv', body, sources.length, altTime, multispec, targetRoomName);

        // If null, we hit max creeps.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];

        // Initialze memory for the role.  Also assign a source position
        // from which to harvest, spreading bootstrappers evenly across the
        // harvest positions, based on their instance number.
        // ... TBD... I'm not sure sources is reliably ordered... need to keep
        // an eye out on this.... and perhaps add a sort here.  but it's not
        // our array to sort... (maybe rooms needs to sort it -- but as it comes
        // from find I'm not sure even room is allowed... TBD TBD).
        let source = sources[crmem.instance % sources.length];

        // Find the first harvest position for the assigned source.
        // (Where, we will build a container for holding proceeds).  Choose
        // the closest, and hopefully plains.
        let hp = trObj.getDediHarvestPosition(hrObj, source);

        crmem.tRoomName = targetRoomName;
        crmem.srcX      = source.pos.x;
        crmem.srcY      = source.pos.y;
        crmem.ctrp      = {}
        crmem.ctrp.x    = hp.x;
        crmem.ctrp.y    = hp.y;
        crmem.state     = 'moveHpos';


        // TBD - we don't need instance number after spawn logic is complete.
        // then again, leave it for now, just in case :)
        // delete crmem.instance
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
	    let trObj  = RoomHolder.get(crmem.tRoomName);
	    let hrObj  = RoomHolder.get(crmem.homeName);
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
	    let structs;

	    let debug="";

	    // Defence
	    if(this.commonDefence(creep, crObj, hrObj, trObj)){
	        crmem.state = 'moveHpos';
	        this.clearTarget();
            //if(creep.name == 'dharv_W4N27_W4N26_2_alt')
            //    console.log('T='+Game.time+ creep.name+' common defence');
	        return;
	    }

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'dharv_W5N33_W5N34_2_alt')
            //    console.log('T='+Game.time+' '+creep.name+' state='+crmem.state);

            switch(crmem.state){
            case 'moveHpos':
                if(!crmem.ctrp){
                    console.log(creep.name+' pos='+creep.pos+' BUG! creep sad. No destination :( ');
                    creep.suicide();
                    return;
                }
                if(cRoom.name == crmem.tRoomName)
                    rc=this.actionMoveToCoord(crmem.ctrp.x, crmem.ctrp.y,null);
                else{
                    rc=this.actionMoveToCoord(crmem.ctrp.x, crmem.ctrp.y, crmem.tRoomName);
                }
                if(rc == OK) {
                    // The move action will move us within 1 square of target -- normally OK.
                    // With the DediHarv we really want to be ON it, because we will harvest
                    // and drop spare when we go over capacity.
                    if(creep.pos.x == crmem.ctrp.x && creep.pos.y == crmem.ctrp.y)
                        crmem.state = 'pickSource';
                    else {
                        this.actMoveTo(crmem.ctrp.x, crmem.ctrp.y);
                        return;
                    }
                    break;
                }
                return;

            case 'pickSource':
                // Find target source of energy, as designated in spawn logic.
                let sources  = crObj.getSources();
                let best;

                for(si=0; si<sources.length; si++){
                    if(sources[si].pos.x == crmem.srcX
                       && sources[si].pos.y == crmem.srcY)
                    {
                       best = sources[si];
                       break;
                    }
                }
                if(!best){
                    console.log('BUG! No source at designated source position x='+crmem.srcX+' y='+crmem.srcY);
                    return;
                }
                this.setTarget(best);
                crmem.state = 'harvestSource';
                break;

            case 'harvestSource':
                // With 5 WORK we get 10 per turn.  If we go over, energy be
                // dropped.  Which is fine if we're standing on the container.
                // Not as fine if we're building that container, or it is full.
                // Find container and see what the situation is.
                let st = null;
                structs=crObj.getContainers();
                for(si=0; si<structs.length; si++){
                    let fst = structs[si];
                    if(fst.pos.x == crmem.ctrp.x && fst.pos.y == crmem.ctrp.y){
                        st = fst;
                        break;
                    }
                }

                // SK rooms can easily get disrupted and fall behind on repair
                // duties.  Rebuilding a container is very disruptive as the
                // SK creep keeps walking over the site while being built.
                // To prevent this - take any opportunities to repair if we're
                // falling behind.   The SK DediHarv does contain a little
                // CARRY to allow this.
                if(st && crObj.m_rmem.keeperRoom && creep.carry[RESOURCE_ENERGY] > creep.carryCapacity/2){
                    if(   st.hits < (st.hitsMax/2)
                       || _.sum(st.store) == st.storeCapacity
                      ) {
                        let rc;
                        this.clearTarget();
                        this.setTarget(st);
                        rc = this.repairStruct();
                        this.clearTarget();
                        crmem.state = 'pickSource';
                        return;
                    }
                }

                if(si == structs.length || st.pos.x != creep.pos.x || st.pos.y != creep.pos.y
                   || (_.sum(st.store) + 10) > st.storeCapacity )
                {
                    if(creep.carry.energy + 10 > creep.carryCapacity){
                        crmem.state = 'pickFill';
                        this.clearTarget();
                        break;
                    }
                }

                rc=this.harvestSource(st?true:false);
                if(rc == ERR_FULL){
                    // We generally expect to be and remain full, as energy will drop into
                    // container.  If we found that earlier, just continue on as nothing to see here.
                    // Else we do need to 'fill' or build.
                    if(st)
                        crmem.state = 'pickSource';
                    else
                        crmem.state = 'pickFill';
                    break;
                }
                if(rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    // targetId is cleared so we do need to re-pick.
                    crmem.state = 'pickSource';
                    return;
                }
                if(rc == ERR_NO_PATH){
                    crmem.state = 'pickSource';
                    return;
                }
                console.log(creep.name+' harvestSource rc='+rc);
                crmem.state = 'pickSource';
                return;

            case 'pickFill':
                // We have a designated container location next to source, which
                // may need to be built yet.  Find it.
                structs=crObj.getContainers();
                for(si=0; si<structs.length; si++){
                    let st = structs[si];
                    if(st.pos.x == crmem.ctrp.x && st.pos.y == crmem.ctrp.y){
                        this.setTarget(st);
                        break;
                    }
                }
                if(si != structs.length){
                    // If the structure is needing repair, repair now.
                    // Actually, I'm disabling this, and relying on external
                    // repair.  This allows me to tune the dediharv to 5 WORK
                    // and fully harvest the source.  It can't afford the time
                    // to repair.    But saving the code in case we want to
                    // go back to 6 WORK.
                    /*if(struct.hits < (.90*struct.hitsMax))
                        crmem.state = 'repairStruct';
                    else*/
                    crmem.state = 'fillStructure';
                    break;
                }

                // Didn't find it, and so we probably need to build it.
                // Check if there's a site, else create it.
                let sites = crObj.getSites();
                let found = false;
                for(si=0; si<sites.length; si++){
                    let site = sites[si];
                    if(site.pos.x == crmem.ctrp.x && site.pos.y == crmem.ctrp.y){
                        this.setTarget(site);
                        break;
                    }
                }
                if(si == sites.length){
                    // Doesn't exist yet, so create it.
                    cRoom.createConstructionSite
                             (crmem.ctrp.x,crmem.ctrp.y,STRUCTURE_CONTAINER);
                    return;
                }
                crmem.state = 'buildContainer';
                break;

            case 'buildContainer':
                rc=this.buildSite();
                if(rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    crmem.state = 'pickSource';
                    break;
                }

                crmem.state = 'pickSource';
                break;

            case 'fillStructure':
                rc=this.fillTarget(RESOURCE_ENERGY);
                if(rc == OK)
                    return;
                if(rc == ERR_FULL){
                    crmem.state = 'pickSource';
                    return;
                }
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    crmem.state = 'pickSource';
                    break;
                }
                console.log(creep.name+' fillTarget rc'+rc);
                if(creep.carry.energy == 0)
                    crmem.state = 'harvestSource';
                else{
                    crmem.state = 'pickFill';
                    return;
                }
                break;

            /* See note above where we jump into repairStruct.
            case 'repairStruct':
                rc=this.repairStruct();
                if( rc == OK)
                    return;
                crmem.state = 'pickSource';
                break;
            */

            default:
                console.log('BUG! Unrecognized creep state='+crmem.state+' for creep='+creep.name);
                crmem.state = 'pickSource';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);
	}
}

module.exports = Role_DediHarv;
