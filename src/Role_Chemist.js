
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');
var LabGroup        = require('LabGroup');
var Preference      = require('Preference');

// The chemist moves good back and forth out of labs to meet LabGroup production
// orders.

class Role_Chemist extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, hrObj ) {
        let room        = spawn.room;
        let rmem        = room.memory;
        let controller  = room.controller;
        let body;
        let cost;
        let max;
        let altTime;
        let isWar = (Preference.warPrep || rmem.assaultT || (Game.time - rmem.assaultLastT)<= 200000);

        // We only need chemists if we have active lab groups and orders
        let labGroup = hrObj.getLabGroup();
        if(!labGroup || (labGroup.getChemistOrder() == null && !isWar))
            return false;

        // This is excessive, but for initial testing, TBD to balance this.
        // Also TBD to assume roads... it's 1-1 move right now not 1/2
        body = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
        cost = 600;
        max  = 1;
        altTime = (body.length*3)+10;

        if(isWar){
            body = [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
            cost = 2400;
            max = 1;
        }

        // Wait for it, if not yet available
        if(room.energyAvailable < cost)
            return true;

        // Find a free name and spawn the bot.
        // For first room we'll boot a gazillion of them, so no
        // need for alt names or such.
        let crname = Creep.spawnCommon(spawn, 'chemist', body, max, altTime);

        // If null, max creeps are already spawned.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];

        // Initialze memory for the role
        crmem.state = 'init';
        delete crmem.instance;

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
	    let rc;
	    let maxLoop = 6;
	    let exceed;
	    let si;
	    let debug="";
	    let order;

	    let labGroup = hrObj.getLabGroup();
	    let trm      = hrObj.getTerminal();
	    let sto      = hrObj.getSpawnStorage();
        let noTerminalOrder = false;

	    if(!labGroup || !trm){
	        if(crmem.state != 'recycleCreep') {
                console.log(creep.name+'Chemist room '+creep.pos.roomName+' has no lab group or terminal, recycling');
                crmem.state = 'recycleCreep';
            }
	    }

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'chemist_E4N47_0')
            //    console.log(creep.name+' loop='+exceed+' state='+crmem.state+' pos='+creep.pos);

            switch(crmem.state){

            case 'init':
                crmem.state = 'getTerminalOrder';
                break;

            case 'getTerminalOrder':
                if(creep.ticksToLive < 50 && _.sum(creep.carry == 0)){
                    crmem.state = 'recycleCreep';
                    break;
                }

                // Get order to move goods terminal -> lab
                order = labGroup.getChemistOrderTerminalToLab();
                //if(creep.name == 'chemist_E4N47_0')
                //    console.log('...order='+JSON.stringify(order));
                debug=debug+' ... order='+JSON.stringify(order)+'\n';

                if(!order){
                    noTerminalOrder = true;
                    crmem.state = 'getLabOrder';
                    break;
                }
                delete crmem.lastOrderT;
                crmem.order = order;
                if(order.src != 'terminal')
                    console.log(creep.name+'BUG! order source not terminal:'+order.src);

                let reg = crmem.order.good;
                if(!trm.store[reg] || trm.store[reg] < sto.store[reg]/3)
                    this.setTarget(sto);
                else
                    this.setTarget(trm);
                crmem.state = 'withdrawTerminal';
                break;

            case 'withdrawTerminal':
                rc=this.withdrawStruct(crmem.order.good);

                if(rc == ERR_NO_PATH){
                    crmem.state = 'getTerminalOrder';   // because targeId will be invalidated.
                    return;
                }

                debug=debug+'\t ..rc='+rc+' tgt='+crmem.order.tgt+' good='+crmem.order.good+' \n';
                if(rc == ERR_FULL){
                    let target = Game.getObjectById(crmem.order.tgt);
                    if(!target){
                        debug=debug+'\t ..no resolve tgt='+crmem.order.tgt+'\n';
                        this.setTarget(trm);
                        crmem.state = 'fillTerminal';
                    }
                    else {
                        this.setTarget(target);
                        crmem.state = 'fillLab';
                    }
                    break;
                }
                if(rc == OK)
                    return;
                else if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    if(creep.carry[crmem.order.good]>0){
                        let target = Game.getObjectById(crmem.order.tgt);
                        this.setTarget(target);
                        crmem.state = 'fillLab';
                    }
                    else {
                        this.setTarget(trm);
                        crmem.state = 'fillTerminal';
                    }
                }
                else if(rc == ERR_NO_PATH){
                    this.setTarget(trm);
                    crmem.state = 'fillTerminal';
                }
                else{
                    console.log('withdraw terminal rc='+rc+' pos='+creep.pos);
                    crmem.state = 'init';
                    return;
                }
                break;

            case 'fillLab':
                rc=this.fillTarget(crmem.order.good);
                debug=debug + '\t ..rc='+rc+'\n';
                if(rc == OK)
                    return;
                else if(_.sum(creep.carry)==0){
                    if(creep.ticksToLive < 50)
                        crmem.state = 'recycleCreep';
                    else
                        crmem.state = 'getLabOrder';
                    break;
                }
                else if(rc == ERR_FULL){
                    this.setTarget(trm);
                    crmem.state = 'fillTerminal';
                    break;
                }
                else {
                    this.setTarget(trm);
                    crmem.state = 'fillTerminal';
                    console.log(creep.name+' fillTarget1 rc='+rc+' target='+crmem.targetId);
                }
                return;

            case 'getLabOrder':

                if(creep.ticksToLive < 50 && _.sum(creep.carry == 0)){
                    crmem.state = 'recycleCreep';
                    break;
                }

                // Get order to move goods lab -> terminal
                order = labGroup.getChemistOrderLabToTerminal();
                debug=debug+'.. order='+JSON.stringify(order)+'\n';
                
                if(!order){
                    // If we already are carrying goods from earlier lab order
                    // move it to terminal.
                    if(_.sum(creep.carry) != 0){
                        this.setTarget(trm);
                        crmem.state = 'fillTerminal';
                        break;
                    }
                    else {
                        if(creep.ticksToLive < 50){
                            crmem.state = 'recycleCreep';
                            break;
                        }
                    }
                    if(!noTerminalOrder){
                        crmem.state = 'getTerminalOrder';
                        break;
                    }

                    // The chemist often has a lot of down time, little time pressure, and decent carry.
                    // So it serves a pretty good mortician.  Go after any corpses.
                    let tombs = hrObj.getTombstones();
                    if(tombs && tombs.length > 0){
                        let ti;
                        for(ti=0; ti<tombs.length; ti++){
                            let tomb = tombs[ti];

                            // Don't bother unless there's enough to make it worth the roundtrip
                            if(_.sum(tomb.store) >= 10*creep.pos.getRangeTo(tomb.pos)){
                                this.setTarget(tomb);
                                crmem.state = 'getTomb';
                                break;
                            }
                        }
                        if(ti != tombs.length)
                            break;
                    }

                    // If we don't get a lab order for 100 turns, and there is no active production - recycle.
                    if(!crmem.lastOrderT)
                        crmem.lastOrderT = Game.time;

                    let tgtProduct = LabGroup.getTargetProduct();
                    if( (Game.time - crmem.lastOrderT) > 100 && !tgtProduct){
                        console.log(creep.name+' Recycling creep at '+creep.ticksToLive+' no orders product='+tgtProduct);
                        crmem.state = 'recycleCreep';
                        break;
                    }

                    // Move toward labs to stay out of way of storage
                    if(!labGroup.getChemistOrderTerminalToLab())
                        this.actMoveTo(labGroup.m_labs[0]);
                    return;
                }
                delete crmem.lastOrderT;

                crmem.order = order;
                if(order.src == 'terminal')
                    console.log(creep.name+'BUG! not lab');

                let src = Game.getObjectById(crmem.order.src);
                if(!src)
                    console.log('BUG! invalid source id out of getChemistOrderLabToTerminal'+crmem.orer.src);
                this.setTarget(src);
                crmem.state = 'withdrawLab';
                break;

            case 'withdrawLab':
                debug=debug+'.. good='+crmem.order.good+' lab='+crmem.targetId+'\n';
                rc=this.withdrawStruct(crmem.order.good);
                debug=debug+'.. rc='+rc+'\n';
                if(rc == OK)
                    return;
                if(rc == ERR_NO_PATH){
                    crmem.state = 'getLabOrder';   // because targeId will be invalidated.
                    return;
                }
                if(_.sum(creep.carry) < creep.carryCapacity){
                    crmem.state = 'getLabOrder';
                    break;
                }
                this.setTarget(trm);
                crmem.state = 'fillTerminal';
                break;

            case 'getTomb':
                rc=this.pickupTomb(null);
                if(rc == ERR_FULL){
                    this.setTarget(trm);
                    crmem.state = 'fillTerminal';
                    break;
                }
                if(rc == OK)
                    return;
                if(_.sum(creep.carry) > 0){
                    this.setTarget(trm);
                    crmem.state = 'fillTerminal';
                }
                else
                    crmem.state = 'getTerminalOrder';
                return;

            case 'fillTerminal':
                rc=this.fillTarget(null);
                debug=debug + '\t ..rc='+rc+'\n';
                if(rc == OK)
                    return;
                if(rc == ERR_FULL){
                    this.setTarget(trm);
                    return;
                }
                else if(_.sum(creep.carry)==0){
                    if(creep.ticksToLive < 50 || !labGroup)
                        crmem.state = 'recycleCreep';
                    else
                        crmem.state = 'getTerminalOrder';
                    break;
                }
                else {
                    console.log(creep.name+' fillTarget2 rc='+rc+' target='+crmem.targetId);
                    this.setTarget(trm);
                    return;
                }
                return;

            case 'recycleCreep':
                if(_.sum(creep.carry) > 0){
                    this.setTarget(trm);
                    crmem.state = 'fillTerminal';
                    break;
                }
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
                crmem.state = 'init';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);
	}
}

module.exports = Role_Chemist;
