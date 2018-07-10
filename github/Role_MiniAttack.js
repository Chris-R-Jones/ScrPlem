
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// A very simple early attack bot for protecting room from hostiles that
// enter when in safe mode in early room setup before we have turret.
// (Really shouldn't get used too much)
const BODY_M1 = [ ATTACK, MOVE ];
const BODY_M1_COST = 130;

class Role_MiniAttack extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn ) {
        let room        = spawn.room;
        let controller  = room.controller;
        let body;
        let cost;

        // Only need these creeps if if spawn is 'Spawn1' and at early control
        // levels.
        if(controller.level >= 4 || spawn.name != 'Spawn1')
            return false;

        // And only if room is actually under attack.
        let rObj  = RoomHolder.get(room.name);
        let hostiles;
        hostiles = rObj.m_room.find(FIND_HOSTILE_CREEPS);
        if(hostiles.length == 0)
            return false;
        else {
            console.log('Hostiles!');
            for (let hi=0; hi<hostiles.length; hi++){
                console.log(' .. hi='+hi+' host='+hostiles[hi]);
            }
        }

        if(room.energyCapacityAvailable >= BODY_M1_COST){
            body = BODY_M1;
            cost = BODY_M1_COST;
        }

        // Wait for it, if not yet available
        if(room.energyAvailable < cost)
            return true;

        // Find a free name and spawn the bot.
        // Only 1 needed, there's an assumption of safe mode here.
        let crname = Creep.spawnCommon(spawn, 'miniatk', body, 1, 0);

        // This at least should mean we hit max creeps.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];

        // Initialze memory for the role.  Also assign a source position
        // from which to harvest, spreading bootstrappers evenly across the
        // harvest positions, based on their instance number.
        crmem.state = 'defend';

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
	    let hrObj  = RoomHolder.get(creep.room.name);
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
        let controller = hrObj.m_room.controller;

	    for(exceed=0; exceed<maxLoop; exceed++){

            switch(crmem.state){
            case 'defend':
                let hostile = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS);
                if(!hostile){
                    if ( Math.abs(creep.pos.x - controller.pos.x) >= 2
                         || Math.abs(creep.pos.y - controller.pos.y) >=2
                       ) {
                          // just to get it out of the way.
                        this.actMoveTo(controller);
                        return;
                    }
                }
                creep.attack(hostile);
                this.actMoveTo(hostile);
                return
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n');
	}
}

module.exports = Role_MiniAttack;
