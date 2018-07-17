
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');


// Role_Mason is nearly the same logic as Role_Repair, but focused only on wall repair,
// and with a build better suited to support that -- namely, that it can travel offroad
// and has a bigger (but somewhat less efficient) build for faster repair in time of defence.


// Roughly for L4 room (1300 energy limit)
const BODY_SITES_M2 = [ WORK, WORK, WORK, WORK
                      , CARRY, CARRY, CARRY, CARRY
                      , CARRY, CARRY, CARRY
                      , MOVE, MOVE, MOVE
                      , MOVE, MOVE, MOVE, MOVE, MOVE
                      , MOVE, MOVE, MOVE
                      ];
const BODY_SITES_M2_COST = 1300;

// Roughly for L5 room (1800 energy limit)
const BODY_SITES_M3 = [ WORK, WORK, WORK, WORK, WORK, WORK
                      , CARRY, CARRY, CARRY, CARRY
                      , CARRY, CARRY, CARRY, CARRY, CARRY
                      , MOVE, MOVE, MOVE
                      , MOVE, MOVE, MOVE, MOVE, MOVE, MOVE
                      , MOVE, MOVE, MOVE, MOVE, MOVE, MOVE
                      ];
const BODY_SITES_M3_COST = 1800;

// Roughly for L6+ room (2300 energy limit)
const BODY_SITES_M4 = [ WORK, WORK, WORK, WORK, WORK, WORK
                      , CARRY, CARRY, CARRY, CARRY
                      , CARRY, CARRY, CARRY, CARRY, CARRY
                      , CARRY, CARRY, CARRY, CARRY, CARRY
                      , MOVE, MOVE, MOVE
                      , MOVE, MOVE, MOVE, MOVE, MOVE, MOVE
                      , MOVE, MOVE, MOVE, MOVE, MOVE, MOVE
                      , MOVE, MOVE, MOVE, MOVE, MOVE
                      ];
const BODY_SITES_M4_COST = 2300;

// L8 (maybe L7 too?) final
const BODY_SITES_M5 = [ WORK, WORK, WORK, WORK, WORK
                      , WORK, WORK, WORK, WORK, WORK
                      , CARRY, CARRY, CARRY, CARRY, CARRY
                      , CARRY, CARRY, CARRY, CARRY, CARRY
                      , CARRY, CARRY, CARRY, CARRY, CARRY
                      , MOVE, MOVE, MOVE, MOVE, MOVE
                      , MOVE, MOVE, MOVE, MOVE, MOVE
                      , MOVE, MOVE, MOVE, MOVE, MOVE
                      , MOVE, MOVE, MOVE, MOVE, MOVE
                      , MOVE, MOVE, MOVE, MOVE, MOVE
                      ];
const BODY_SITES_M5_COST = 3000;

// Won't spawn unless some wall is < 90% of defence limit.
const WALL_RAMPART_SPAWN_PERCENT = .90;

class Role_Mason extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, hrObj) {
        let room        = spawn.room;
        let rmem        = room.memory;
        let controller  = room.controller;
        let body;
        let cost;
        let max = 1;

        // Don't spawn masons bots unless at least some walls are worse than 90% of
        // defence limit.
        let walls = hrObj.getRampartsWalls();
        let spStorage = hrObj.getSpawnStorage();
        let defenceMax = hrObj.getDefenceMax();

        // Make sure room has reached L4.
        // I used to also wait til plan complete to keep the masons from starving
        // construction, but I changed to just make sure there's a decent energy stockpile.
        if(controller.level < 4 || !spStorage || spStorage.store.energy < 30000)
            return false;

        if(walls.length == 0)
            return false;

        if(hrObj.m_minRampartsWallsHits > (defenceMax*WALL_RAMPART_SPAWN_PERCENT))
            return false;

        if(hrObj.m_minRampartsWallsHits > 1000000 && hrObj.m_minRampartsWallsHits > (hrObj.getAvgMinWallsHits()*1.1))
            return false;

        if(!spStorage)
            return false;

        // Choose the body we want and will wait for energy for.
        if(room.energyCapacityAvailable >= BODY_SITES_M5_COST){
            body = BODY_SITES_M5;
            cost = BODY_SITES_M5_COST;
        }
        else if(room.energyCapacityAvailable >= BODY_SITES_M4_COST){
            body = BODY_SITES_M4;
            cost = BODY_SITES_M4_COST;
        }
        else if(room.energyCapacityAvailable >= BODY_SITES_M3_COST){
            body = BODY_SITES_M3;
            cost = BODY_SITES_M3_COST;
        }
        else {
            body = BODY_SITES_M2;
            cost = BODY_SITES_M2_COST;
        }

        // Wait for it, if not yet available
        if(room.energyAvailable < cost)
            return true;


        // Note - I used to have separate logic for L7 under the theory it had
        // less spawns and I wanted to favor upgrades over masonry.
        // Arguably that might still make more sense when we don't have many L8 rooms.
        // So TODO to revisit that special case.  But generally we want to just get busy at L7.
        // Note there's not a lot of worry about spawn pressure -- we still spawn upgraders first over masons.

        if(room.controller.level >= 7){
            let minStruct = hrObj.m_minRampartWallStruct;
            if(minStruct.hits < 1000000 || (hrObj.m_minRampartsWallsHits < (hrObj.getAvgMinWallsHits()*.80)))
                max = Math.floor(spStorage.store.energy / 30000);
            else if( (hrObj.m_minRampartsWallsHits < (hrObj.getAvgMinWallsHits() )))
                max = Math.floor(spStorage.store.energy / 120000);
            if(max == 0)
                return false;
        }

        // Find a free name and spawn the bot.
        // We spawn these repair only on demand due to broken sites,
        // and there's not a lot of urgency to that, so no alt need.
        let crname = Creep.spawnCommon(spawn, 'mason', body, max, 0, "", spawn.room.name);
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];

        // Initialze memory for the role.
        crmem.state = 'pickEnergy';

        delete crmem.instance;

        console.log(Game.time+' '+room.name+' MASON GRANTED max='+max+' minWall='+hrObj.m_minRampartsWallsHits+' Avg='+(hrObj.getAvgMinWallsHits()));


        return true;
    };


    // Logic callback invoked to have a creep run it's actions - derived from
    // base Creep class (a 'virtual function' or whatever you call it in JS).
	runLogic()
	{
	    let crmem = this.m_crmem;
	    let creep = this.m_creep;
	    let rObj   = RoomHolder.get(creep.room.name);
	    let rc;
	    let maxLoop = 6;
	    let exceed;
	    let si;
	    let debug="";
	    let defenceMax = rObj.getDefenceMax();
                        let struct;
        let minStruct = rObj.m_minRampartWallStruct;

        if(!minStruct){
            console.log('MASON with no min struct in room'+creep.room.name);
            return;
        }

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            switch(crmem.state){

            case 'pickEnergy':
                let sto = rObj.getSpawnStorage();

                // Pick terminal if it has more energy proportionally.
                let trm = rObj.getTerminal();
                if(trm && (!sto || 3*trm.store.energy > sto.store.energy)){
                    sto = trm;
                }

                if(!sto){
                    // In remote harvesting rooms we just source off dediharv
                    // containers.
                    let containers = rObj.getContainers();
                    let container= creep.pos.findClosestByPath
                                    (containers
                                    ,   { filter: function (st)
                                            {
                                                return (st.store.energy >= 150);
                                            }
                                        }
                                    );
                    if(container == null)
                        return;
                    sto = container;
                }
                this.setTarget(sto);
                crmem.state = 'withdrawStruct';
                break;

            case 'withdrawStruct':
                rc=this.withdrawStruct(RESOURCE_ENERGY);
                if(rc == ERR_FULL){
                    crmem.state = 'pickRepair';
                    break;
                }
                if(rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    // targetId is cleared so we do need to re-pick.
                    crmem.state = 'pickEnergy';
                    return;
                }
                if(rc == ERR_NO_PATH){
                    crmem.state = 'pickEnergy';
                    return;
                }
                crmem.state = 'pickEnergy';
                break;

            case 'pickRepair':

                // When repairing, we want to fully repair a target to the high
                // water mark, before switching targets, making it a little different
                // than many other actions.  the Creep::repairStruct still clears
                // the target, so we keep a separate variable to preserve a
                // target once picked.
                if(crmem.savedTargetId){

                    // Lookup object and see if it's over high watermark, if so clear.
                    struct = Game.getObjectById(crmem.savedTargetId);
                    if( struct.hits >= defenceMax ){
                        delete crmem.savedTargetId;
                    }
                    else {
                        this.setTarget(struct);
                        crmem.state = 'repairStruct';
                        break;
                    }
                }

                // Else we need a new target.  But RoomObj already tracks the min wall/rampart

                // TBD, if there's nothing, we should perhaps just reclaim.
                if(!minStruct /*|| minStruct.hits >= defenceMax*/){
                    crmem.state = 'pickEnergy';
                    return;
                }

                this.setTarget(minStruct);
                crmem.savedTargetId = minStruct.id;
                crmem.state = 'repairStruct';
                break;

            case 'repairStruct':
                struct = Game.getObjectById(crmem.savedTargetId);

                // If our target is gone, or we're done with it, select a new target.
                // We'll only switch targets if there is one below the low watermark,
                // else we'll just dump a full load on our target so we don't waste
                // lots of time moving around.  Even though that means we'll go over
                // defence max, this is more efficient in the long run.
                if(!struct
                   || ( struct.hits > defenceMax
                        && minStruct.hits < (defenceMax*WALL_RAMPART_SPAWN_PERCENT)
                      )
                  ) {
                    this.clearTarget();
                    delete crmem.savedTargetId;
                    crmem.state = 'pickRepair';
                    break;
                }

                // Prioritize new ramparts to keep them alive til we
                // get to them.
                if(minStruct.hits <= 601 && minStruct.hits < struct.hits){
                    delete crmem.savedTargetId;
                    this.clearTarget();
                    crmem.state = 'pickRepair';
                    break;
                }

                rc=this.repairStruct();
                if( rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES || creep.carry.energy == 0){
                    delete crmem.savedTargetId;
                    crmem.state = 'pickEnergy';
                }
                else if(rc == ERR_INVALID_TARGET){
                    let structs = rObj.getAllStructures();


                    // We still have energy but finished with this repair.
                    // Repair tends to bounce us around, so while we're in the
                    // area, look for structs that aren't fully degraded to
                    // the low watermark, but are still in need of repair and
                    // below the high watermark. This avoids us bouncing around
                    // from target to target, using remaining energy on targets
                    // of opportunity in area.
                    let struct =
                    creep.pos.findClosestByRange
                        (structs,
                            { filter: function (st)
                                {
                                    if(st.structureType != STRUCTURE_WALL
                                        && st.structureType != STRUCTURE_RAMPART)
                                        return false;
                                    return (st.hits < defenceMax);
                                }
                            }
                        );
                    if(struct){
                        this.setTarget(struct);
                        break;
                    }
                    else
                        crmem.state = 'pickEnergy';
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

module.exports = Role_Mason;
