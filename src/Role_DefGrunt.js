var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// So far, at least, this is a boosted creep only, and tuned accordingly.
const BODY_M1 = [ ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
                , ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
                , ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
                , ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
                , ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
                , ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
                , ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
                , ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
                , MOVE, MOVE, MOVE, MOVE, MOVE
                , MOVE, MOVE, MOVE, MOVE, MOVE
                ];
// + 40x80 = 3200 ATTACK
// + 10x50  = 500 MOVE
// = 3800
const BODY_M1_COST = 3800;

// Body for testing..
//const BODY_M1 = [ ATTACK, MOVE ];
//const BODY_M1_COST = 130;

class Role_DefGrunt extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, hrObj, targetRoomName, shouldBoost, max ) {
        let hRoom        = spawn.room;
        let tRoom        = Game.rooms[targetRoomName];
        let controller   = hRoom.controller;
        let cost         = BODY_M1_COST;
        let body         = BODY_M1;

        if(hRoom.energyAvailable < cost)
            return true;

        // Find a free name and spawn the bot.
        let altTime = 200;
        let multispec = (shouldBoost ? "boost":"noboost") ;
        let crname = Creep.spawnCommon(spawn, 'defgrunt', body, max, altTime, multispec, targetRoomName);

        // If null, we hit max creeps.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];
        crmem.state     = 'init';
        crmem.tRoomName  = targetRoomName;
        crmem.shouldBoost = shouldBoost;
        delete crmem.instance;
        return true;
    };

    // Helper to find lab to boost a certain body part for this creep
    findLabForBoost(crObj, part)
    {
        let boost;
        switch(part){
        case MOVE:
            boost = 'XZHO2';
            break;
        case ATTACK:
            boost = 'XUH2O';
            break;
        default:
            return null;
        }

        let labs = crObj.getLabs();
        for(let li=0; li<labs.length; li++){
            let lab = labs[li];
            if(   (lab.mineralType == boost)
               && (lab.mineralAmount >= 900)
               && (lab.energy >= 600)
               )
               return lab;
        }

        return null;
    }



    // Logic callback invoked to have a creep run it's actions - derived from
    // base Creep class (a 'virtual function' or whatever you call it in JS).
	runLogic()
	{
	    let crmem = this.m_crmem;
	    let creep = this.m_creep;
	    let cRoom  = creep.room;
	    let crObj  = RoomHolder.get(cRoom.name);
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
	    let debug="";
	    let bix;

        // Attack logic is independent of move logic.  We'll just attack
        // whatever is closest.  (Should probably refine that later).
        let hostiles = crObj.getHostiles();
        let hCreep = creep.pos.findClosestByPath(hostiles);
        if(!hCreep && hostiles.length)
            hCreep = creep.pos.findClosestByRange(hostiles);

        // Test overrides
        //let allCreep = cRoom.find(FIND_CREEPS);
        //let oCreep;
        //oCreep = creep.pos.findClosestByPath(allCreep
        //                        , { filter: function (cr)
        //                              {
        //                                return (cr.memory.role == 'test');
        //                              }
        //                          }
        //                        );
        //if(oCreep)
        //    hCreep = oCreep;

        // Figure out range to hostile and attack if possible
        let hRange;
        if(hCreep)
            hRange = hCreep.pos.getRangeTo(creep.pos);
        if(hCreep && hRange <= 1)
            creep.attack(hCreep);

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'defgrunt_E4N47_1')
            //    console.log(Game.time+' '+creep.name+' state='+crmem.state+' pos='+creep.pos);

            switch(crmem.state){

            case 'init':
                if(crmem.shouldBoost)
                    crmem.state = 'checkBoosts';
                else
                    crmem.state = 'engageTargets';
                return;

            case 'checkBoosts':
                for(let bix=0; bix<creep.body.length; bix++){
                    if(creep.body[bix].boost)
                        continue;
                    if(!this.findLabForBoost(crObj,creep.body[bix].type)){
                        console.log('Missing boost for '+creep.body[bix].type);
                        // For most creeps we would reclaim.  But these are still
                        // pretty useful bodies.  Just do your best to fight.
                        crmem.state = 'engageTargets';
                        return;
                    }
                }
                crmem.state = 'applyBoosts';

                return;

            case 'applyBoosts':
                for(bix=0; bix<creep.body.length; bix++){
                    if(creep.body[bix].boost)
                        continue;
                    let lab = this.findLabForBoost(crObj,creep.body[bix].type);
                    if(!lab){
                        console.log('Missing boost for '+creep.body[bix].type+' in apply!!');
                        return;
                    }
                    if(creep.pos.getRangeTo(lab)>1)
                        this.actMoveTo(lab);
                    lab.boostCreep(creep);
                    return;
                }
                crmem.state = 'engageTargets';
                break;

            case 'engageTargets':
                if(creep.room.name != crmem.homeName)
                    return this.actionMoveToRoomRouted(crmem.homeName);

                if( hCreep && hRange > 1
                    && Math.abs(hCreep.pos.x) != 0
                    && Math.abs(hCreep.pos.x) != 49
                    && Math.abs(hCreep.pos.y) != 0
                    && Math.abs(hCreep.pos.y) != 49
                    ){
                        // Check to see if we're already in a rampart.
                        // If so, only move farther if more than 2 away.
                        // The path move tends to tell us to move the wrong
                        // direction since it's incomplete.
                        if(hRange == 2) {
                            let loSt = creep.room.lookForAt(LOOK_STRUCTURES, creep.pos);
                            for(let loi=0; loi<loSt.length; lo++){
                                if(loSt[loi].structureType == STRUCTURE_RAMPART)
                                    return;
                            }
                        }
                        let rc = this.defenceMatMove(hCreep.pos);
                }
                return;

            case 'moveReclaim':
                // Head back home to reclaim.  But if we got reassigned to a new division,
                // turn back to new target.
                rc = this.actionMoveToRoomRouted(crmem.homeName);
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
                crmem.state = 'moveHome';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);
	}
}

module.exports = Role_DefGrunt;
