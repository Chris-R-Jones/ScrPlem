
var Squad      = require('Squad');
var RoomHolder = require('RoomHolder');
var Preference = require('Preference');
var RoomCoord  = require('RoomCoord');

const ORDER_OBSERVE = 1;
const ORDER_DEFENCE = 2;
const ORDER_ATTACK   = 3;

class Division
{
    static considerNewDivision(roomName, rmem, attackOrder)
    {
        // Invoked whenever the general sees a hostile room without a division
        // -- evaluates if the room needs a division spawned and instantiates
        // if so.
        let needDiv = false;

        // If no rmem, we probably got an attack order on unvisisted, just return true.
        if(!rmem)
            return true;

        // Figure out if this is a center hosted room.
        let isCenter = false;
        if(rmem.hostRoom && rmem.owner == 'none'){
            let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName);
            let fv = parsed[1];
            let sv = parsed[2];
            isCenter = (fv%10 == 5 && sv%10 == 5);
        }

        if(attackOrder && (!rmem || !rmem.safeMode || (rmem.safeMode-(Game.time-rmem.hostileLastT))< 100))
            needDiv = true;
        else if(rmem.owner == 'me')
            needDiv = true;
        else if(rmem.owner == 'none' && (rmem.keeperRoom || isCenter) && rmem.hostRoom ){
            let rObj = RoomHolder.get(roomName);
            if(!rObj || !(rObj.m_room))
                needDiv =false;
            else {
                let hostiles = rObj.getHostiles();
                let hi;
                for( hi=0; hi<hostiles.length; hi++){
                    if(hostiles[hi].owner.username == "Source Keeper")
                        continue;
                    break;
                }
                if(hi != hostiles.length)
                    needDiv = true;
                else
                    needDiv = false;
            }
        }
        else if(rmem.safeMode && (rmem.safeMode-(Game.time-rmem.hostileLastT))> 100 )
            needDiv = false;
        else if(rmem.hostRoom)
            needDiv = true;

        if(needDiv){
            return new Division(roomName, attackOrder);
        }
        else
            return null;
    }

    // Invoked to create a new division object.  Generally to re-create an
    // object that was in Memory, but also by Generalissimo if it finds a room
    // that is newly hostile, to create a division for it.
    constructor(tgtRoomName, manualAttackOrder)
    {
        let dmem = Memory.divisions[tgtRoomName];

        this.m_tgtRoomName = tgtRoomName;
        if(!dmem) {
            // Brand new division.  Register it in memory.
            dmem = Memory.divisions[tgtRoomName] = {}
            if(Preference.debugMilitary)
                console.log('T='+Game.time+' New division instantiated for room '+tgtRoomName);
        }

        let rmem = Memory.rooms[tgtRoomName];
        this.m_tgtRoomMem = rmem;
        let trObj = RoomHolder.get(tgtRoomName);
        this.m_trObj = trObj;


        if(manualAttackOrder && (!rmem || !rmem.safeMode || (rmem.safeMode-(Game.time-rmem.hostileLastT))< 100))
            dmem.isAttackOrder = true;
        else
            dmem.isAttackOrder = false;


        // Determine what generally we need to do with this room.
        if(!rmem)
            this.m_primaryOrder = ORDER_ATTACK;

        else if (rmem){
            switch(rmem.owner){
            case 'none':
            case 'nouser':

                // Check if this is adjacent to one of our rooms.  If so,
                // defend, else just observe (for now, though later we may want
                // to start spawning forces to prepare defence of our rooms).
                if(rmem.hostRoom) {
                    this.m_primaryOrder = ORDER_DEFENCE;
                }
                else
                    this.m_primaryOrder = ORDER_OBSERVE;

                break;

            case 'me':
                this.m_primaryOrder = ORDER_DEFENCE;
                break;

            default:

                // Some other user's room.
                // If it is safemoded or wiped of structures, just observe.
                // Else attack.
                if(rmem.safeMode && (rmem.safeMode-(Game.time-rmem.hostileLastT))> 1800 )
                    this.m_primaryOrder = ORDER_OBSERVE;
                else{
                    if(rmem.hostileCt){
                        this.m_primaryOrder = ORDER_ATTACK;
                    }
                    else if(trObj){
                        let astruct = trObj.getAllStructures();
                        if(astruct && astruct.length > 0)
                            this.m_primaryOrder = ORDER_ATTACK;
                        else
                            this.m_primaryOrder = ORDER_OBSERVE;
                    }
                }
                break;
            }
        }

        if(dmem.isAttackOrder)
            this.m_primaryOrder = ORDER_ATTACK;
        else if(this.m_primaryOrder == ORDER_ATTACK)
            this.m_primaryOrder = ORDER_OBSERVE;

        // Reset list of assigned squads. Squads will be re-attached by
        // Generalissimo, which scans them.
        this.m_squads = [];
        this.m_bodCt = {};
    };

    setAttackOrder( flag )
    {
        let sqmem = Memory.divisions[this.m_tgtRoomName];
        sqmem.isAttackOrder = flag;
    }

    // Called by squad to attach itself to this division
    attachSquad(squad)
    {
        this.m_squads.push(squad);
    }

    // After all squads have been attached, this is invoked to give new orders
    // to division.  It calculates target body counts and then re-assigns
    // squad members if over counts, or stands down division if no longer needed.
    giveOrders()
    {
        let trmem = this.m_tgtRoomMem;
        let squads = this.m_squads;
        let squad;

        this.calculateNeeds();

        // If room is no longer under attack, give squads back to reserves
        // for reassignment, and stand down division
        if(this.m_primaryOrder != ORDER_ATTACK
            && trmem
            && (
                       ( ! trmem.hostileCt || trmem.hostileCt == 0)
                    || ( trmem.owner != "me" && !trmem.hostRoom)
                )
            && ( trmem.hostileOwner == 'Invader' || trmem.hostileOwner == 'Screeps' || (Game.time - trmem.hostileLastT ) > 1300 )
          ) {
            while( (squad = squads.shift()) )
                squad.setOrderStandDown();
            delete Memory.divisions[this.m_tgtRoomName];

            if(Preference.debugMilitary)
                console.log('T='+Game.time+' Division '+ this.m_tgtRoomName +' standing down');
            return;
        }

        // If the room is a keeper room and the only hostiles are source keepers
        // we can also stand down.
        if(this.m_primaryOrder != ORDER_ATTACK
           && trmem
           && trmem.hostRoom
           && trmem.keeperRoom
           && this.m_trObj
           && this.m_trObj.m_room
           ){
            let hostiles = this.m_trObj.getHostiles();
            let hi;
            for( hi=0; hi<hostiles.length; hi++){
                if(hostiles[hi].owner.username == "Source Keeper")
                    continue;
                break;
            }
            if(hi == hostiles.length){
                while( (squad = squads.shift()) )
                    squad.setOrderStandDown();
                delete Memory.divisions[this.m_tgtRoomName];
                if(Preference.debugMilitary)
                    console.log('Division '+ this.m_tgtRoomName +' standing down');
            }
        }

        // Give orders (currently only for attack division)
        if(this.m_primaryOrder == ORDER_ATTACK){
            for(let si=0; si<this.m_squads.length; si++){
                this.m_squads[si].giveOrders();
            }
        }

    }

    calculateNeeds()
    {
        let rmem = this.m_tgtRoomMem;
        let rObj = this.m_trObj;

        this.m_needs = { attack: 0, ranged_attack: 0, heal: 0, work: 0};

        if(this.m_primaryOrder == ORDER_OBSERVE)
            return;

        if( this.m_primaryOrder != ORDER_ATTACK
            && (!rmem.hostileCt || rmem.hostileCt == 0)
          )
            return;

        // If we have no memory at all, we need to something small at least to expore.
        // (TBD is this even possible?)
        if(!rmem ) {
            this.m_needs[ATTACK]=1;
            return;
        }

        // Determine hostile attack counts.
        let hAttack = (rmem.hostileBodCt && rmem.hostileBodCt[ATTACK]) ? rmem.hostileBodCt[ATTACK] : 0;
        let hRanged = (rmem.hostileBodCt && rmem.hostileBodCt[RANGED_ATTACK]) ? rmem.hostileBodCt[RANGED_ATTACK] : 0;
        let hHeal   = (rmem.hostileBodCt && rmem.hostileBodCt[HEAL]) ? rmem.hostileBodCt[HEAL] : 0;
        let hTough  = (rmem.hostileBodCt && rmem.hostileBodCt[TOUGH]) ? rmem.hostileBodCt[TOUGH] : 0;

        // First set local variables on our target needs
        let nAttack;
        let nRanged;
        let nHeal;
        let nWork;

        nAttack = hAttack+5;
        nRanged = hRanged+5
        nHeal   = hHeal+5;
        nHeal = Math.max(nHeal, (nAttack+nRanged)/2);
        nWork = 0;

        // On invader attacks, we generally don't need heal, attack/ranged
        // will do it- they can always retreat to home healing.
        if((rmem.hostileCt && rmem.hostileCt <= 3) && ( rmem.hostileOwner == 'Invader' || rmem.hostileOwner == 'Screeps'))
            nHeal = 0;

        // On bigger attacks especially nonuser, boost our numbers
        else if (rmem.hostileOwner != 'Invader' && rmem.hostileOwner != 'Screeps' && rmem.owner != "none" && rmem.owner != "nouser"){
            nAttack += 20;
            nRanged += 20;
        }

        // On attacks, stimulate spawning of military accompaniment (ranged)
        // on top of any forces that are known to be present
        if(this.m_primaryOrder == ORDER_ATTACK){
            if(    (rmem.owner == "nouser" || rmem.owner == "reserved")
                || !rmem.hostileTowerCt
                || rmem.hostileTowerCt == 0){

                // Generally this case is for attacking a remote harvest room.  We don't need much, but do need to keep
                // a presence.
                nRanged = Math.max(nRanged,30);
            }
            else {
                nRanged = Math.max(nRanged,40);
            }
        }

        let boostedAttackRoom = false;
        if(this.m_primaryOrder == ORDER_ATTACK && Preference.attackBoosted == true){
            for(let ati=0; ati<Preference.boostedAttackRooms.length; ati++){
                if(this.m_tgtRoomName == Preference.boostedAttackRooms[ati])
                    boostedAttackRoom = true;
            }
        }

        // Stimulate lots of healing when there are towers.
        if(this.m_primaryOrder == ORDER_ATTACK){
            if(!boostedAttackRoom){
                if(nHeal < 3 )
                    nHeal = 3;
                if( rmem.hostileTowerCt > 0 && nHeal < 100)
                    nHeal = 100;
            }
            else {
                // Let's deal with single boosted creeps initially so we
                // don't waste resources, we can bump up later if needed.
                nHeal = 15;
            }
        }

        // Stimulate wall breakers
        if(this.m_primaryOrder == ORDER_ATTACK){
            let allStruct;
            if(rObj && rObj.m_room)
                allStruct = rObj.getAllStructures();
            if(    (rmem.hostileTowerCt && rmem.hostileTowerCt>0)
                || (allStruct && allStruct.length > 1)
               ){
                if(rmem.hostileTowerCt > 0)
                    nWork = 500;
                else
                    nWork = 25;
            }
            else if (!rObj || (rObj && ! rObj.m_room)){
                // We're likely to need something, but wait til we have a presence
                // to decide what else we keep spawning just because we temporarily
                // lost vision.
                nWork=0;
            }
        }

        if(Preference.debugMilitary == 'verbose' || Preference.debugMilitary == this.m_tgtRoomName){
            console.log(Game.time+' Setting needs attack'+nAttack+' ranged='+nRanged+' heal='+nHeal+' work='+nWork);
        }
        this.m_needs[ATTACK]=nAttack;
        this.m_needs[RANGED_ATTACK]=nRanged;
        this.m_needs[HEAL]=nHeal;
        this.m_needs[WORK]=nWork;
    }

    needSpawn(spawnRoomName)
    {
        // If this division is an attack order, make sure the spawn room
        // matches.
        if(this.m_primaryOrder == ORDER_ATTACK && Preference.attackFromRooms){
            let ri;
            for(ri=0; ri<Preference.attackFromRooms.length; ri++){
                if(Preference.attackFromRooms[ri] == spawnRoomName){
                    break;
                }
            }
            if(ri == Preference.attackFromRooms.length)
                return null;
        }

        // Let host room deal with small invader threats as generally it can
        // react more quickly.  But if it doesn't react within 50 ticks of
        // friendly creeps leaving the room (which is generally around 75
        // ticks of becoing hostile then help out.  It's probably either
        // too busy or somehow incapable.  Let neighboring rooms help out
        // at increasing distance with how long it has been hostile.
        // (Each 30 turns, allow rooms at distance 1 more room away)
        let rmem = this.m_tgtRoomMem;
        let trObj = this.m_trObj;
        let spCoord = new RoomCoord(spawnRoomName);
        let tgtCoord = new RoomCoord(this.m_tgtRoomName);
        let linearDist = (spCoord.xDist(tgtCoord) + spCoord.yDist(tgtCoord));
        if(rmem && rmem.hostileCt && rmem.hostileCt <= 3 && rmem.hostileOwner == 'Invader'
           && (rmem.hostRoom != spawnRoomName && this.m_tgtRoomName != spawnRoomName)
           && (Game.time-rmem.hostileStartT) <= (linearDist * 30)
           ) {
            let hostObj = RoomHolder.get(rmem.hostRoom);
            if(hostObj && hostObj.m_room.controller.level >= 5)
                return null;
            console.log('DBG 1 - gave host room a chance');
        }

        if(spawnRoomName != rmem.hostRoom && spawnRoomName != this.m_tgtRoomName){
            console.log('DBG SPAWN ALLOWING HELP elapsed='+(Game.time-rmem.hostileStartT)+' dist='+linearDist
                       +'\n\t tgt='+this.m_tgtRoomName+'\n\thelper='+spawnRoomName
                       +'\n\t rmem.hostileCt='+rmem.hostileCt
                       +'\n\t rmem.hostileOwner='+rmem.hostileOwner
                       +'\n\t rmem.hostRoom='+rmem.hostRoom
                       );
        }

        let dAttack = this.m_bodCt[ATTACK] ? this.m_bodCt[ATTACK] : 0;
        let dRanged = this.m_bodCt[RANGED_ATTACK] ? this.m_bodCt[RANGED_ATTACK] : 0;
        let dHeal   = this.m_bodCt[HEAL] ? this.m_bodCt[HEAL] : 0;
        let dTough  = this.m_bodCt[TOUGH] ? this.m_bodCt[TOUGH] : 0;
        let dWork   = this.m_bodCt[WORK] ? this.m_bodCt[WORK] : 0;

        let nAttack = (this.m_needs[ATTACK] - dAttack);
        let nRanged = (this.m_needs[RANGED_ATTACK] - dRanged);
        let nHeal   = (this.m_needs[HEAL] - dHeal);
        let nWork   = (this.m_needs[WORK] - dWork);

        let model = null;

        // Check if we should be boosting in this room.
        let boostedAttackRoom = false;
        if(this.m_primaryOrder == ORDER_ATTACK && Preference.attackBoosted == true){
            for(let ati=0; ati<Preference.boostedAttackRooms.length; ati++){
                if(this.m_tgtRoomName == Preference.boostedAttackRooms[ati])
                    boostedAttackRoom = true;
            }
        }

        // Spawn omnis if below attack/ranged defecit.  But only do it if we have at least
        // some healers (and need some).
        if(  (nAttack > 0 || nRanged > 0)
             && ( nHeal <= 0 || dHeal >= (dAttack + dRanged) )
          ) {
            model='omni';
        }
        else if (nHeal > 0) {
            if(boostedAttackRoom)
                model='boostHeal';
            else
                model='heal';
        }
        else if (nWork > 0){
            if(boostedAttackRoom)
                model = 'boostDecon';
            else
                model='decon';
        }

        if(Preference.debugMilitary == 'verbose' || Preference.debugMilitary == this.m_tgtRoomName){
            console.log(JSON.stringify(this.m_needs));
            console.log(Game.time+' '+spawnRoomName+' returned need '+model+' for div='+this.m_tgtRoomName);
            console.log('.. attack need='+this.m_needs[ATTACK]+' have='+this.m_bodCt[ATTACK]);
            console.log('.. ranged need='+this.m_needs[RANGED_ATTACK]+' have='+this.m_bodCt[RANGED_ATTACK]);
            console.log('.. heal need='+this.m_needs[HEAL]+' have='+this.m_bodCt[HEAL]);
            console.log('.. work need='+this.m_needs[WORK]+' have='+this.m_bodCt[WORK]);
        }

        return model;
    }

    considerSquad(squad)
    {
        // Is this even possible? Seems like it is - we check stand down before
        // calling considerSquad (sounds wrong ??)
        if(squad.m_creeps.length < 1)
            return false;

        // For now, only accept squads if they are within 5 rooms distant (linear)
        // In the future - perhaps extend this depending on importance/size of threat.
        if(squad.roomDistance(this.m_tgtRoomName) > 5)
            return false;

        let dAttack = this.m_bodCt[ATTACK] ? this.m_bodCt[ATTACK] : 0;
        let dRanged = this.m_bodCt[RANGED_ATTACK] ? this.m_bodCt[RANGED_ATTACK] : 0;
        let dHeal   = this.m_bodCt[HEAL] ? this.m_bodCt[HEAL] : 0;
        let dTough  = this.m_bodCt[TOUGH] ? this.m_bodCt[TOUGH] : 0;
        let dWork   = this.m_bodCt[WORK] ? this.m_bodCt[WORK] : 0;

        let nAttack = (this.m_needs[ATTACK] - dAttack);
        let nRanged = (this.m_needs[RANGED_ATTACK] - dRanged);
        let nHeal   = (this.m_needs[HEAL] - dHeal);
        let nWork   = (this.m_needs[WORK] - dWork);


        let sAttack = squad.m_bodCt[ATTACK];
        let sRanged = squad.m_bodCt[RANGED_ATTACK];
        let sHeal = squad.m_bodCt[HEAL];

        if(sAttack && sAttack > 0 && nAttack > 0)
            return true;
        if(sRanged && sRanged > 0 && nRanged > 0)
            return true;
        if(sHeal && sHeal > 0 && nHeal > 0)
            return true;
        return false;
    }

    // Invoked when a creep is first spawned but was associated with this
    // division, to assign that creep to a squad.
    assignNewCreep(crObj)
    {
        let debugFlag = false;
        if(Preference.debugMilitary == 'verbose' || Preference.debugMilitary == this.m_tgtRoomName)
            debugFlags = true;

        if(debugFlag)
            console.log('Division::assignNewCreep called for creep '+crObj.m_creep.name);

        let squad;
        let si;

        // Walk through existing squads and see if this creep should join.
        for(si=0; si<this.m_squads.length; si++){
            squad = this.m_squads[si];
            if(squad.needsNewCreep(crObj)){
                if(debugFlag)
                    console.log('... assigned to squad '+squad.m_sqName);
                squad.addCreep(crObj);
                return;
            }
        }

        // Else we need a new squad (and we'll name after the creep as it is the first
        // to join, although we can probably do better TBD).
        if(debugFlag)
            console.log('... will instantiate new squad ');
        squad = new Squad(crObj.m_creep.name, this);
        this.m_squads.push(squad);
        squad.addCreep(crObj);
    }

};

module.exports = Division;
