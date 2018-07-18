var Preference = require('Preference');
var Division   = require('Division');
var Squad      = require('Squad');
var CreepMon   = require('CreepMon');

var Mil_Decon           = require('Mil_Decon');
var Mil_Healer          = require('Mil_Healer');
var Mil_Looter          = require('Mil_Looter');
var Mil_Omni            = require('Mil_Omni');

var Mil_AtkBoostDecon   = require('Mil_AtkBoostDecon');
var Mil_AtkBoostHeal    = require('Mil_AtkBoostHeal');

// The Generalissimo class coordinates all military activities.
// It contains only static members and isn't instantiated but is responsible
// for instantiating divisions and squads to give orders to individual creeps.

// Divisions - are used to represent forces assigned to attack/hold/recapture
//   a specified target.  The forces may actually be in other rooms, for example
//   rallying ot travelling to target.
var g_divisions;

// Squads - are used to represent small groups of forces in the division that
//   rally together to support each other.  They're typically small - 1 to 4 creeps.
var g_squads;

// List of squads that aren't assigned to divisions, in reserves.
var g_reserves;

// Records whether we have spawned a military creep this turn. Avoid doing
// more than one per turn.
var g_spawnThisTurn;

// Manual attack order rooms
var g_attackOrders = Preference.attackOrders;

class Generalissimo
{
    // Returns the maximum we'll repair walls & ramparts in a room.
    static getDefenceMax(controller)
    {
        let defenceMax;
        let ctrlProgressPct = (controller.progress / controller.progressTotal);

        if(controller.level <= 5)
            defenceMax = 50000*ctrlProgressPct;
        else if(controller.level == 6)
            defenceMax = 50000+500000*ctrlProgressPct;

        // L7 & L8 have more progressive upgrade calculations, and so
        // don't really use this limit (this is just the actual wall limit)
        else if (controller.level == 7)
            defenceMax = 100000000;
        else
            defenceMax = 300000000;
        return defenceMax;
    }

    // Invoked from main loop to rebalance military forces and create/delete
    // divisions/squads as needed.
    static warRoom()
    {
        let squad;
        let div;

        if(!Memory.reserves)
            Memory.reserves = {}
        if(!Memory.squads)
            Memory.squads = {}
        g_spawnThisTurn = false;

        //------ Refresh/rebuild division objects
        // Delete and re-instantiate division objects from memory, refreshing
        // their state and needs.
        g_divisions = {};
        if(!Memory.divisions)
            Memory.divisions = {}
        for (let rName in Memory.divisions){

            // See if there is an attack order.
            let attackOrder;
            if(g_attackOrders[rName] == true)
                attackOrder = true;
            else
                attackOrder = false;

            g_divisions[rName] = new Division(rName,attackOrder);
        }

        //-------
        // Delete and re-instantiate squads from memory, re-attaching to divisions.
        g_squads = {};
        g_reserves = [];
        if(!Memory.squads)
            Memory.squads = {}
        for (let sqName in Memory.squads){
            let sqmem = Memory.squads[sqName];
            if(sqmem.divisionName){
                div   = g_divisions[sqmem.divisionName];
                if(!div){
                    console.log("BUG! missing division "+sqmem.divisionName
                               +" indicated by squad "+sqName
                               +" trying to just re-create it");
                    div = g_divisions[sqmem.divisionName] = new Division(sqmem.divisionName,false);
                }
                g_squads[sqName] = squad = new Squad(sqName, div);
                div.attachSquad(squad);
            }
            else {
                // Squad is in reserves
                g_squads[sqName] = squad = new Squad(sqName, null);
                g_reserves.push(squad);
            }
        }

        //----------
        // Review known rooms for hostiles, and create new divisions if necessary.
        for ( let rName in Memory.rooms ){
            let rmem = Memory.rooms[rName];

            // See if there is an attack order.
            let attackOrder;
            if(g_attackOrders[rName] == true){
                if(rmem.owner == 'me' || rmem.hostRoom){
                    // Failsafe - as I once typed attack order for my own room instead of the 'attackFrom' list.
                    // Resulting in Mil_Decon fiasco.  Let's not do that again...
                    console.log("IDIOT!!! Don't attack your own rooms.  Ignoring attack order.");
                    attackOrder = false;
                }
                else {
                    attackOrder = true;
                }
            }
            else
                attackOrder = false;

            if( rmem.hostileCt > 0 || attackOrder ){
                let div = Memory.divisions[rName];
                if(!div) {
                    div = Division.considerNewDivision(rName, rmem, attackOrder);
                    if(div){
                        g_divisions[rName] = div;
                    }
                }
            }
        }

        //------------
        // Review if any new divisions need to be created due to attack orders
        // that weren't already
        for ( let rName in g_attackOrders ){
            if(!g_attackOrders[rName])
                continue;
            if(!Memory.rooms[rName])
                console.log('Attack order for '+rName+' no memory');
            div = Division.considerNewDivision(rName, Memory.rooms[rName], true);
        }


        //------------
        // Walk through all the creeps that are assigned to squads or
        // divisions and place them.  Note that a creep might have
        // a division set but not a squad if it's newly spawned.
        // This possibly triggers new squad creation.
        for (let crName in Memory.creeps){
            let crObj = CreepMon.get(crName);
            let crmem = crObj.m_crmem;
            if(crmem.squad){
                let squad = g_squads[crmem.squad];
                squad.addCreep(crObj);
            }
            else if(crmem.division){
                let division = g_divisions[crmem.division];
                if(division){
                    division.assignNewCreep(crObj);
                }
                else {
                    console.log(crName+'BUG! Military creep orphaned from division?!'+crmem.division);
                    delete crmem.division;
                }
            }
        }

        //------------
        // Now that all the objects have gotten created and associated,
        // walk through and review/update orders.  Any unneeded squads
        // should be returned to the Memory.reserves list.
        for ( let divName in g_divisions ){
            let div = g_divisions[divName];
            div.giveOrders();
        }

        // Review squads in divisions.  Some of them may not have creeps
        // any longer.  Stand them down if all their creeps be dead.
        for ( let sqName in g_squads ) {
            let sq = g_squads[sqName];
            sq.checkStandDown();
        }

        //--------------
        // By console we can request a debug dump by setting the following
        // debug flag -- which will get reset after one dump.
        if(Memory.debugReqMilitary){
            console.log('------------- DIVISION REPORT ---------------');
            for(let divName in g_divisions) {
                if(Memory.debugReqMilitary != true && Memory.debugReqMilitary != divName)
                    continue;
                let div = g_divisions[divName];
                console.log('Division '+divName);
                console.log('   ORDER: '+div.getOrderString());
                console.log('   Needs: '+JSON.stringify(div.m_needs));

                for( let sqName in div.m_squads ){
                    let sq = div.m_squads[sqName];
                    console.log('   squad '+sq.m_sqName);

                    for( let cr in sq.m_creeps ){
                        let crObj = sq.m_creeps[cr];
                        console.log('       .. '+crObj.m_creep.name+' pos='+crObj.m_creep.pos+' role='+crObj.m_crmem.role);
                    }

                }
            }
            console.log('------------- END DIVISION REPORT ---------------');
            delete Memory.debugReqMilitary;
        }


        //--------------
        // Review squads in reserves, and see if they should move to
        // a division.  Only assign one per turn to let counts re-adjust

        for( let si=0; si<g_reserves.length;){

            let sq      = g_reserves[si];
            let found   = false;

            for(let divName in g_divisions){
                let div = g_divisions[divName];

                // If there's no memory, this division has stood down since the beginning of the tick.
                if(!Memory.divisions[divName])
                    continue;

                if(div.considerSquad(sq)){
                    console.log('Reassigning reserve squad '+sq.m_sqName+' to division '+div.m_tgtRoomName);
                    sq.setDivision(div);
                    g_reserves.splice(si,1);
                    // Note that this squad isn't actually assigned into
                    // division yet -- orders were already set -- that
                    // will happen next turn.
                    found = true;
                    break;
                }
            }
            if(found)
                continue;

            sq.checkStandDown();

            // Only increment here, as we know we didn't delete an element
            si++;
        }
    }

    // Invoked in spawn loops to let General spawn military bots if needed.
    static doSpawn(spawn, roomObj)
    {
        if(g_spawnThisTurn)
            return true;
        if( !roomObj.getSpawnStorage() )
            return false;

        // Walk through divisions and ask what their needs are.
        // TBD to have them return deficit counts..
        for ( let divName in g_divisions ){
            let div   = g_divisions[divName];

            let request = div.needSpawn(spawn.room.name);
            if(request){
                switch(request){
                case 'omni':
                    if(spawn.room.energyAvailable < spawn.room.energyCapacityAvailable)
                        return true;
                    if(Mil_Omni.spawn( spawn, roomObj, div, 99)){
                        g_spawnThisTurn = true;
                        return true;
                    }
                    break;
                case 'decon':
                    if(spawn.room.energyAvailable < spawn.room.energyCapacityAvailable)
                        return true;
                    if(Mil_Decon.spawn( spawn, roomObj, div, 99)){
                        g_spawnThisTurn = true;
                        return true;
                    }
                    break;
                case 'heal':
                    if(Mil_Healer.spawn( spawn, roomObj, div, 99)){
                        if(spawn.room.energyAvailable < spawn.room.energyCapacityAvailable)
                            return true;
                        g_spawnThisTurn = true;
                        return true;
                    }
                    break;
                case 'boostDecon':
                    if(spawn.room.energyAvailable < spawn.room.energyCapacityAvailable)
                        return true;
                    if(Mil_AtkBoostDecon.spawn( spawn, roomObj, div, 99)){
                        g_spawnThisTurn = true;
                        return true;
                    }
                    break;
                case 'boostHeal':
                    if(Mil_AtkBoostHeal.spawn( spawn, roomObj, div, 99)){
                        if(spawn.room.energyAvailable < spawn.room.energyCapacityAvailable)
                            return true;
                        g_spawnThisTurn = true;
                        return true;
                    }
                    break;
                default:
                    break;
                }
            }
        }
        return false;
    };
}

module.exports = Generalissimo;
