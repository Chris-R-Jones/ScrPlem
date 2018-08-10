
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Role_Miner is a dedicated mineral extractor.
// Much like DediHarv it just lets materials drop into dedicated container at mineral
// source, and lets a Role_MineralMover do the heavy lifting.

class Role_Miner extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    // Note that generally minerals aren't in remote room.  But we might do
    // remote mining out of central sectors in the future, so leaving the
    // target room movement intact.
    static spawn( spawn, hrObj, targetRoomName ) {
        let hRoom        = spawn.room;
        let tRoom        = Game.rooms[targetRoomName];
        let controller   = hRoom.controller;
        let body;
        let cost;

        // Make sure room has an extractor, extraction container, and minerals
        // left to mine.
        let trObj = RoomHolder.get(targetRoomName);
        if(!trObj.m_room)
            return false;

        let hrTrm = hrObj.getTerminal();
        let hrSto = hrObj.getSpawnStorage();
        let extract = trObj.getExtractor();
        let mineral = trObj.getMineral();
        let cont = trObj.getMineralHarvestContainer(hrObj);

        if(!hrTrm || ! hrSto || !mineral || !extract || !cont)
            return false;

        let stoVal = hrSto.store[mineral.mineralType]?hrSto.store[mineral.mineralType]:0;
        let trmVal = hrTrm.store[mineral.mineralType]?hrTrm.store[mineral.mineralType]:0;
        if( !mineral.mineralAmount
            || mineral.mineralAmount == 0
            || (trmVal+stoVal) >= 20000
            )
            return false;

        // Size the creep:
        //  * We get to harvest every 5 turns, and so the more WORK we do each time we
        //    get a harvest opportunity the better.
        //  * In very rare cases we might have to carry the proceeds to the container
        //    (if it was impossible to position a container directly next to the
        //     mineral because free spots were next to exit zone)
        //    Generally though, we don't give CARRY and just drop into container.
        cost = 0;
        body = [];

        if(cont.pos.getRangeTo(mineral.pos) > 1){
            body = [ CARRY, MOVE ];
            cost = 100;
        }

        while( (cost+250) < hRoom.energyCapacityAvailable && body.length <= 47 ){
            body.push(WORK);
            body.push(WORK);
            body.push(MOVE);
            cost += 250;
        }

        // Wait for it, if not yet available.
        if(hRoom.energyAvailable < cost)
            return true;

        // Find a free name and spawn the bot.
        let altTime = 0;
        let multispec = "" ;
        let crname = Creep.spawnCommon(spawn, 'miner', body, 1, altTime, multispec, targetRoomName);

        // If null, we hit max creeps.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];

        crmem.tRoomName = targetRoomName;
        crmem.ctrp      = {}
        crmem.ctrp.x    = cont.pos.x;
        crmem.ctrp.y    = cont.pos.y;
        crmem.state     = 'moveHpos';
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
	    let hrObj  = RoomHolder.get(crmem.homeName);
	    let trObj  = RoomHolder.get(crmem.tRoomName);
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
	    let structs;
	    let mineral;
	    let st;

	    let debug="";

	    // Defence
	    if(this.commonDefence(creep, crObj, hrObj, trObj)){
	        crmem.state = 'moveHpos';
	        this.clearTarget();
	        return;
	    }

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'miner_E6S11_0')
            //    console.log(Game.time+' '+creep.name+' state='+crmem.state);

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
                        crmem.state = 'pickMineral';
                    else {
                        this.actMoveTo(crmem.ctrp.x, crmem.ctrp.y);
                        return;
                    }
                    break;
                }
                return;

            case 'pickMineral':
                // Get extractor & set target.
                mineral  = crObj.getMineral();
                if(!mineral){
                    console.log('BUG! no mineral for miner?!');
                    return;
                }
                this.setTarget(mineral);
                crmem.state = 'harvestMineral';
                break;

            case 'harvestMineral':

                // On rare occassions we have to carry our harvest to the container.
                // If we've carrying, move to container.
                if(_.sum(creep.carry)>0){
                    this.clearTarget();
                    crmem.state = 'fillContainer';
                    break;
                }

                // And if we have to move back do that now.
                mineral = this.getTarget();
                if(creep.pos.getRangeTo(mineral) > 1){
                    this.actMoveTo(mineral);
                    return;
                }


                // Avoid glutting terminal
                let hrTrm = hrObj.getTerminal();
                let hrSto = hrObj.getSpawnStorage();
                let stoVal = hrSto.store[mineral.mineralType]?hrSto.store[mineral.mineralType]:0;
                let trmVal = hrTrm.store[mineral.mineralType]?hrTrm.store[mineral.mineralType]:0;
                if((stoVal+trmVal) >= 21000){
                    creep.suicide();
                    return;
                }

                // Otherwise, we never carry our harvest. If we go over, minerals be
                // dropped.  Which is fine if we're standing on the container.
                // Not as fine if it is full.
                // Find container and see what the situation is.
                st = trObj.getMineralHarvestContainer(hrObj);
                if( !st || (_.sum(st.store) + 50) > st.storeCapacity )
                {
                    return;
                }

                // We only get to harvest every 6 turns.  Pace ourselves.
                if(crmem.lastHaT && (Game.time-crmem.lastHaT)<6){
                    return;
                }

                rc=this.harvestSource(true);

                if(rc == ERR_FULL || rc == OK){
                    // We generally expect to be and remain full, as minerals will drop into
                    // container.
                    crmem.lastHaT = Game.time;
                    if(rc == OK)
                        return;
                    crmem.state = 'pickMineral';
                    return;
                }
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    // It'll be a while, go reclaim
                    crmem.state = 'moveReclaim';
                    return;
                }
                if(rc == ERR_NO_PATH){
                    console.log('BUG! ERR_NO_PATH on miner harvest?!');
                    return;
                }

                crmem.state = 'pickMineral';
                return;

            case 'fillContainer':
                if(_.sum(creep.carry)==0){
                    crmem.state = 'pickMineral';
                    break;
                }
                if(creep.pos.x != crmem.ctrp.x || creep.pos.y != crmem.ctrp.y){
                    this.actMoveTo(crmem.ctrp.x, crmem.ctrp.y);
                    return;
                }
                st = trObj.getMineralHarvestContainer(hrObj);
                this.setTarget(st);
                rc=this.fillTarget(null);
                this.clearTarget();
                crmem.state = 'pickMineral';
                return;

            case 'moveReclaim':
                // Head back home to reclaim.  But if we got reassigned to a new division,
                // turn back to new target.
                rc = this.actionMoveToRoom(crmem.homeName);
                if(rc != OK)
                    return;
                let spawns = crObj.getSpawns();
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
                crmem.state = 'pickSource';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);
	}
}

module.exports = Role_Miner;
