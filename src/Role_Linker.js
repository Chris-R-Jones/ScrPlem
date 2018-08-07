var Preference      = require('Preference');
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');


// Very light 100 CARRY creep (a least to start). May increase size later...
const LINKER_NORM_BODY = [ MOVE, CARRY, CARRY ];
const LINKER_NORM_BODY_COST = 150;
const LINKER_NORM_CARRY = 100;

const LINKER_BIG_BODY = [ MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY ];
const LINKER_BIG_BODY_COST = 350;
const LINKER_BIG_CARRY = 300;


// Temporary bigger greep for handling exodus influx
//const LINKER_BODY = [ MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY];
//const LINKER_BODY_COST = 750;
//const LINKER_CARRY = 700;

// Small carry creep that balances resources between terminal and storage.
class Role_Linker extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn, hrObj ) {
        let hRoom        = spawn.room;
        let controller   = hRoom.controller;

        // Get storage and terminal - if not built, no point.
        let spStorage = hrObj.getSpawnStorage();
        let terminal = hrObj.getTerminal();
        if(!terminal || !spStorage || spStorage.structureType != STRUCTURE_STORAGE)
            return false;

        let body = LINKER_NORM_BODY;
        let cost = LINKER_NORM_BODY_COST;
        let maxCreeps = 1;
        let altTime = 0;
        let carry  = LINKER_NORM_CARRY;

        // Calculate how much needs to be moved.  If we're far behind
        // (typically for a new room which we want to get quickly boostrapped)
        // then use a bigger body.
        let deficit=0;
        for(let good in spStorage.store){
            let gDef = spStorage.store[good];
            let tDef = terminal.store[good];

            if(!tDef)
                tDef = 0;

            // When < 1000 we try to move goods in terminal.  Don't count
            // those (collectively they can add up to quite a bit and don't
            // follow the normal 1/3 ratio)
            if(tDef <= 1000 && gDef < 1000)
                continue;
            deficit += (gDef-(3*tDef));
        }
        for(let good in terminal.store){
            // count goods that are only in terminal, so missed last loop
            if(spStorage.store[good])
                continue;
            let tDef = terminal.store[good];
            if(tDef <= 1000)
                continue;
            deficit += (-3*tDef);
        }

        if( Math.abs(deficit) > 20000 ){
            body = LINKER_BIG_BODY;
            cost = LINKER_BIG_BODY_COST;
            carry = LINKER_BIG_CARRY;
        }

        // Wait for it, if not yet available.
        if(cost > hRoom.energyAvailable)
            return true;

        // Find a free name and spawn the bot.
        let crname = Creep.spawnCommon(spawn, 'linker', body, maxCreeps, altTime, "");

        // If null, we hit max creeps.
        if(crname == null)
            return false;

        if(carry == LINKER_BIG_CARRY){
            console.log(hRoom.name+' Granted big linker deficit = '+deficit);

            deficit=0;
            for(let good in spStorage.store){
                let gDef = spStorage.store[good];
                let tDef = terminal.store[good];

                if(!tDef)
                    tDef = 0;

                // When < 1000 we try to move goods in terminal.  Don't count
                // those (collectively they can add up to quite a bit and don't
                // follow the normal 1/3 ratio)
                if(tDef <= 1000 && gDef < 1000)
                    continue;

                deficit += (gDef-(3*tDef));
                console.log('... good='+good+' gDef='+gDef+' 3*tDef='+(3*tDef)+' deficitNow='+deficit);
            }
            for(let good in terminal.store){
                // count goods that are only in terminal, so missed last loop
                if(spStorage.store[good])
                    continue;
                let tDef = terminal.store[good];
                if(tDef <= 1000)
                    continue;
                deficit += (-3*tDef);

                console.log('... good='+good+' gDef=0 3*tDef='+(3*tDef)+' deficitNow='+deficit);
            }
        }

        let crmem  = Memory.creeps[crname];
        crmem.state     = 'moveLinkPos';
        crmem.carry     = carry;
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
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let debug="";
	    let sto = hrObj.getSpawnStorage();
	    let trm = hrObj.getTerminal();

	    if(!sto || !trm)
	        return;

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'linker_E6N43_0')
            //    console.log(Game.time+' '+creep.name+' loop='+exceed+' state='+crmem.state+' carry='+_.sum(creep.carry) +'tgt='+crmem.targetId);

            switch(crmem.state){

            case 'moveLinkPos':
                // Linker position is directly to right of storage, which is
                // adjacent to terminal, storage, and room link.
                if(this.actionMoveToCoord(sto.pos.x+1,sto.pos.y,null,0) == OK){
                    crmem.state = 'chooseGoods';
                    break;
                }
                return;

            case 'chooseGoods':

                delete crmem.isPurge;

                if(creep.pos.x != sto.pos.x+1 || creep.pos.y != sto.pos.y){
                    console.log(creep.name+' BUG! didnt get in position from moveLinkPos');
                    crmem.state = 'moveLnkPos';
                    break;
                }

                // Don't die red handed.
                if(creep.ticksToLive < 6)
                    return;

                let trmTotal = _.sum(trm.store);

                let maxRsc;
                let maxDiff;
                for( let ri=0; ri<RESOURCES_ALL.length; ri++){
                    let rsc = RESOURCES_ALL[ri];

                    let stoU = sto.store[rsc];
                    let trmU = trm.store[rsc];
                    if(!stoU && !trmU)
                        continue;

                    if(!stoU)
                        stoU = 0;
                    if(!trmU)
                        trmU = 0;

                    // Overcapacity failsafe.  Drop junk and make room for
                    // E.  Careful not to go below 5300, because linker will
                    // withdraw 300 and then deposit back in if < 5000
                    if((trmTotal >= 290000 || trm.store.energy < 50000)
                       && rsc.length == 1
                       && rsc != RESOURCE_ENERGY && trmU > 5300
                       && stoU > 15000){
                        maxRsc = rsc;
                        maxDiff = -290000;
                        break;
                    }

                    let diff;
                    if(rsc == RESOURCE_ENERGY || !Preference.storageExodus) {
                        // We always want to keep at least 500 units in terminal
                        // for exchanges & balancing. Beyond that, we try to keep a ratio of 3/1.
                        if( (trmU+stoU) < 2000 ) {
                            if(trmU < 500){
                                diff = (500-trmU);
                                if(diff > stoU)
                                    diff = stoU;
                            }
                            else if(trmU > 500){
                                diff = -(trmU-500);
                            }
                            else
                                diff = 0;
                        }
                        else {
                            // The amount to transfer follows the formula:
                            // x = (S-3T)/4
                            // Not obvious, but the result of solving:
                            //  (3(t+x) = (s-x))
                            // for x
                            diff = ((stoU - 3*trmU)/4);
                        }
                    }
                    else
                        diff =  stoU;

                    // Don't bother with relatively small energy moves. Energy is so frequently traded..
                    // Rather balance the resources that may have smaller moves.
                    if(rsc == RESOURCE_ENERGY && Math.abs(diff) < 300){
                        continue;
                    }

                    if(!maxDiff || Math.abs(diff) > Math.abs(maxDiff)){
                        maxRsc = rsc;
                        maxDiff = diff;

                        //if(creep.name == 'linker_W12N26_0'){
                        //    console.log(Game.time+' .. new best rsc='+rsc+' stoU='+stoU+' trmU='+trmU+' diff='+diff);
                        //}
                    }
                }

                // Don't do less than 10 - might as well save CPU.
                if(Math.abs(maxDiff)>=10){
                    crmem.withdrawCount = Math.abs(maxDiff);
                    if(crmem.withdrawCount > crmem.carry)
                        crmem.withdrawCount = crmem.carry;
                    if(maxDiff > 0){
                        this.setTarget(sto);
                        crmem.rsc = maxRsc;
                        crmem.state = 'withdrawStorage';
                    }
                    else if(maxDiff < 0){
                        this.setTarget(trm);
                        crmem.rsc = maxRsc;
                        crmem.state = 'withdrawTerminal';
                    }
                    break;
                }

                // If there are goods on the product exclude list in storage, trash them.
                let exl = Preference.prodExcludeList;
                exl = [ 'KH', 'KH2O', 'XKH2O' ];  // For now, lets just start with these problematic ones
                for( let exi in exl ){
                    let exrsc = exl[exi];
                    if(sto && sto.store[exrsc] && sto.store[exrsc] > 0) {
                        this.setTarget(sto)
                        crmem.rsc = exrsc;
                        crmem.withdrawCount = sto.store[exrsc];
                        crmem.state = 'withdrawStorage';
                        crmem.isPurge = true;
                        break;
                    }
                    else if(trm && trm.store[exrsc] && trm.store[exrsc] > 0) {
                        this.setTarget(trm)
                        crmem.rsc = exrsc;
                        crmem.withdrawCount = trm.store[exrsc];
                        crmem.state = 'withdrawTerminal';
                        crmem.isPurge = true;
                        break;
                    }
                }
                return;

            case 'withdrawStorage':
                debug=debug+' ... witdhraw count='+crmem.withdrawCount+' crmemcarry='+crmem.carry+' rc='+rc;
                if(_.sum(creep.carry)>0){
                    this.clearTarget();
                    this.setTarget(trm);
                    crmem.state = 'fillStructure';
                    break;
                }
                if(crmem.withdrawCount && crmem.withdrawCount > creep.carryCapacity)
                    crmem.withdrawCount = creep.carryCapacity;
                rc=this.withdrawStruct(crmem.rsc,crmem.withdrawCount);
                if(rc == OK)
                    return;
                else {
                    console.log(creep.name+' pos='+creep.pos+'BUG! rc='+rc+' rsc='+crmem.rsc+' count='+crmem.withdrawCount );
                    crmem.state = 'moveLinkPos';
                    break;
                }
                return;

            case 'withdrawTerminal':
                if(_.sum(creep.carry)>0){
                    this.clearTarget();
                    this.setTarget(sto);
                    crmem.state = 'fillStructure';
                    break;
                }
                if(crmem.withdrawCount && crmem.withdrawCount > creep.carryCapacity)
                    crmem.withdrawCount = creep.carryCapacity;
                rc=this.withdrawStruct(crmem.rsc,crmem.withdrawCount);
                debug=debug+' ... witdhraw count='+crmem.withdrawCount+' crmemcarry='+crmem.carry+' rc='+rc;
                if(rc == OK)
                    return;
                else {
                    console.log(creep.name+' pos='+creep.pos+'BUG! rc='+rc+' rsc='+crmem.rsc+' count='+crmem.withdrawCount );
                    crmem.state = 'moveLinkPos';
                    break;
                }
                return;

            case 'fillStructure':
                if(_.sum(creep.carry) == 0){
                    crmem.state = 'chooseGoods';
                    this.clearTarget();
                    break;
                }

                // If terminal is overcommitted and we're over limits, drop extra
                // Similarly, we might be purging unwanted goods (isPurge is true)
                for ( let good in creep.carry ) {
                    if (creep.carry[good] && creep.carry[good] != 0){
                        if( crmem.isPurge
                            || ( ( _.sum(trm.store) >= 290000 || trm.store.energy < 50000)
                                   && good.length == 1 && good != RESOURCE_ENERGY && trm.store[good]>=5000
                                   && sto.store[good] >= 15000
                               )
                          ){
                            console.log(creep.name,' Dropped excluded goods: '+creep.carry[good]+' '+good);
                            creep.drop(good,creep.carry[good]);
                            return;
                        }
                    }
                }

                rc=this.fillTarget( null );
                if(rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    crmem.state = 'chooseGoods';
                    break;
                }
                if(rc == ERR_FULL || rc == ERR_INVALID_TARGET){
                    let trmCapLeft = (trm.storeCapacity - _.sum(trm.store));
                    let stoCapLeft = (sto.storeCapacity - _.sum(sto.store));
                    if( trmCapLeft > stoCapLeft)
                        this.setTarget(trm);
                    else
                        this.setTarget(sto);
                }
                return;

            default:
                console.log('BUG! Unrecognized creep state='+crmem.state+' for creep='+creep.name);
                crmem.state = 'moveLinkPos';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);
	}
}

module.exports = Role_Linker;
