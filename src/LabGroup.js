var RoomHolder          = require('RoomHolder');
var TerminalController  = require('TerminalController');
var Preference          = require('Preference');
var Const               = require('Constants');

// Product and reagents we've selected for production, globally.
var g_product;
var g_reagents = [];

class LabGroup
{
    static productLevel( good)
    {
        if(good == 'G')
            return 3;
        else if (good == 'GO' || good=='GH')
            return 4;
        else if (good == 'X' || good == 'GHO2' || good=='GH2O')
            return 5;
        else if(good.length == 1)
            return 1;
        else if(good.length == 2)
            return 2;
        else if(good.length == 4)
            return 5;
        else if(good.length == 5)
            return 6;
        else if(good != RESOURCE_ENERGY){
            console.log('BUG! LabGroup::productLevel unrecognized product'+good);
            return 0;
        }
    }

    static getTargetProduct()
    {
        return g_product;
    }


    static inProdExcludeList( good )
    {
        for(let exi=0; exi<Preference.prodExcludeList.length; exi++){
            if(good == Preference.prodExcludeList[exi])
                return true;
        }
        return false;
    }

    static turnReset()
    {
        // Otherwise we need to figure out what to produce.
        // Avoid switching production too often.  Once we've chosen a best
        // product stick with it at least PRODUCTION_RUN_LENGTH turns to avoid 
        // swapping as levels increase/decrease.  Also to save CPU in the search
        //   If we found nothing to produce - check again in PRODUCTION_BREATHER_LEN turns.
        // many production stalls are due to terminal imbalance that is
        // quickly resolved.   If, however, after the breather, things haven't resolved, 
        // then wait a full production run length for a new scan.  
        // Because, at that point - it's clearly going to take a while for mineral production,
        // and we won't clutter our history.
        let timeSinceSwitch = 0;
        if(Memory.chemistry) {
            timeSinceSwitch = (Game.time - Memory.chemistry.lastSwitchT);
            g_product = Memory.chemistry.product;
            g_reagents[0] = Memory.chemistry.r1;
            g_reagents[1] = Memory.chemistry.r2;
            if(g_product)
                delete Memory.chemistry.noProductAfterBreather;
            if( timeSinceSwitch < Const.LABGROUP_RUN_LENGTH && (g_product || Memory.chemistry.noProductAfterBreather) )
                return;
            else if(timeSinceSwitch < Const.LABGROUP_BREATHER_LEN)
                return;
            else if(!g_product)
                Memory.chemistry.noProductAfterBreather = true;
        }

        // Figure out what, globally, we should be producing, based on
        // aggregate terminal storage levels.
        let totals = TerminalController.getAllTotals();
        let starvedRooms = TerminalController.getStarvedRooms();
        let nTerminals = TerminalController.getNTerminals();

        // For each given product level, figure out what our average storage
        // level is for products of that level.
        //   e.g. level 1  is ( U, H, O, K, Z)
        //        level 2  is ( UL, UH, etc.)
        //        level 3  is ( ZHO2 UH2O, G, etc.)
        //        level 4  are catalyst compositions

        // Generally we want to prioritize production of any product that is
        // below the average for it's level, if we have the reagents to make it
        // That means making sure that we can make it all recipes in the level
        // (that all minerals at the level are capable of full production)
        // And that we know what the average is to determine who is behind.
        // Figure those out now.

        let fullCapacity = { 0: true, 1: true, 2: true, 3: true, 4: true, 5:true, 6:true };
        let missing=[];
        let levTot=[];
        let levNG=[];
        let levAvg=[];
        let missingSummary="";
        for (let level=0; level<7; level++){
            levTot[level]=0;
            levNG[level]=0;
        }
        for (let ri=0; ri<RESOURCES_ALL.length; ri++){
            let good = RESOURCES_ALL[ri];

            if(this.inProdExcludeList(good) || good == 'power')
                continue;

            let level = this.productLevel(good);
            let goodAvg;
            if(totals[good])
                levTot[level] += totals[good];
            levNG[level]++;
            goodAvg = totals[good]/nTerminals;

            if(!totals[good]
               || goodAvg < Const.LABGROUP_REAGENT_MIN_LEVEL
               || (starvedRooms[good] && starvedRooms[good] > 0)
              ){
                for(let li=level; li<7; li++){
                    missing[li] = good;
                    fullCapacity[li] = false;

                    console.log('Formatting '+li+' good='+good+' before='+missingSummary);
                    if(missingSummary != "")
                        missingSummary = ", "+missingSummary;
                    let starvedStr;
                    if(goodAvg >= Const.LABGROUP_REAGENT_MIN_LEVEL && starvedRooms[good] && starvedRooms[good] > 0)
                        starvedStr = "[STARVED]";
                    else
                        starvedStr = "";
                    missingSummary = ("" + good + starvedStr + "(" + totals[good]/nTerminals + ")" + missingSummary);
                    console.log('Formatting '+li+' good='+good+' after='+missingSummary);
                }
            }
        }

        for (let level=0; level<7; level++){
            if(levNG[level] > 0)
                levAvg[level] = levTot[level] / levNG[level];
            else
                levAvg[level] = 0;
        }

        for(let li=1; li<=6; li++){
            console.log('Totals L'+li+' tot= '+levTot[li]+' avg='+levAvg[li]+' fullCapacity='+fullCapacity[li]+' missing='+missing[li]+' avg='+totals[missing[li]]/nTerminals);
        }

        // Find what we can produce, prioritizing by higher levels, second by
        // distance below average.
        let bestProduct;
        let bestR1;
        let bestR2;
        let bestLev;
        let bestDeficit;

        for(let r1 in REACTIONS) {
            let r1Lev = this.productLevel(r1);
            if(!fullCapacity[r1Lev]){
                console.log('Consider r1='+r1+'... skip - level not at full capacity, missing'+missing[r1Lev]);
                continue;
            }
            if(!totals[r1] || (totals[r1]/nTerminals) < Const.LABGROUP_REAGENT_MIN_LEVEL){
                if(totals[r1] && totals[r1] != 0)
                    console.log('Consider r1='+r1+'... skip - totals='+totals[r1]/nTerminals);
                else
                    console.log('Consider r1='+r1+'... skip - totals='+totals[r1]);
                continue;
            }

            for(let r2 in REACTIONS[r1]) {
                let r2Lev = this.productLevel(r2);
                if(!fullCapacity[r2Lev]){
                    console.log('Consider r1='+r1+', r2='+r2+'... skip - r2 level not at full capacity, mising'+missing[r2Lev]);
                    continue;
                }

                if(!totals[r2] || (totals[r2]/nTerminals) < Const.LABGROUP_REAGENT_MIN_LEVEL){
                    if(totals[r2] && totals[r2] != 0)
                        console.log('Consider r1='+r1+', r2='+r2+'... skip - r2 totals='+totals[r2]/nTerminals);
                    else
                        console.log('Consider r1='+r1+'... skip - totals='+totals[r1]);
                    continue;
                }
                let prod = REACTIONS[r1][r2];

                if(this.inProdExcludeList(prod)){
                    console.log('Consider r1='+r1+', r2='+r2+'... skip, product in exclude list');
                    continue;
                }

                let lev = this.productLevel(prod);
                let deficit;
                let tgtAvg = levAvg[lev]+500;

                if(lev != 6 && (totals[prod]/nTerminals) > Const.LABGROUP_REAGENT_MIN_LEVEL){
                    console.log('Consider r1='+r1+', r2='+r2+'... skip, product over '+Const.LABGROUP_REAGENT_MIN_LEVEL+' avg');
                    continue;
                }

                /* Intentionally putting these starvation checks here rather than earlier - because
                 * there some products that are on exclude list also tend to be starved... but starvation
                 * isn't the real problem.
                 */
                if(starvedRooms[r1]){
                    console.log('Consider r1='+r1+'... skip - '+starvedRooms[r1]+' starved rooms');
                    continue;
                }
                if(starvedRooms[r2]){
                    console.log('Consider r1='+r1+', r2='+r2+'... skip - '+starvedRooms[r2]+' starved rooms');
                    continue;
                }

                if(totals[prod] > 0)
                    deficit = tgtAvg-totals[prod];
                else
                    deficit = tgtAvg;

                console.log('Consider r1='+r1+', r2='+r2+' product = '+prod+' deficit='+deficit);

                if(    !bestLev
                    || (lev > bestLev && (deficit > 0 || totals[prod] < (Const.LABGROUP_REAGENT_MIN_LEVEL * nTerminals)) )
                    || (lev == bestLev && deficit > bestDeficit)
                    ) {
                    console.log('......'+r1+'+'+r2+'->'+prod+' lev='+lev+' totals[prod]='+totals[prod]+' levAvg[lev]='+levAvg[lev]+' tgtAvg='+tgtAvg
                               +' deficit='+deficit+' .... new best');

                    bestProduct = prod;
                    bestR1 = r1;
                    bestR2 = r2;
                    bestLev = lev;
                    bestDeficit = deficit;
                }
            }
        }

        if(!Memory.chemistry)
            Memory.chemistry = {};

        if(!Memory.chemistry.product || Memory.chemistry.product != bestProduct){
            Memory.chemistry.product = bestProduct;
            Memory.chemistry.r1 = bestR1;
            Memory.chemistry.r2 = bestR2;
            if(bestProduct){
                console.log('Switching production -best product='+bestProduct)
                console.log('.. r1='+bestR1);
                console.log('.. r2='+bestR2);
                console.log('.. lev='+bestLev);
                console.log('.. deficit='+bestDeficit);

            }
            else
                console.log('Found nothing to produce');
        }

        g_product = bestProduct;
        g_reagents[0] = bestR1;
        g_reagents[1] = bestR2;

        /* Save history of last LABGROUP_HISTORY_SIZE production orders */
        if(!Memory.chemHistory)
            Memory.chemHistory = [];
        let histStr = "T="+Game.time+" skip. missing=[ "+missingSummary+" ]";
        if(bestProduct) {
            histStr = "T="+Game.time+' '+bestR1+"("+(totals[bestR1]/nTerminals)+") + "
                        +bestR2+"("+(totals[bestR2]/nTerminals)+") -> "
                        +bestProduct+"("+(totals[bestProduct]/nTerminals);
        }
        Memory.chemHistory.push(histStr);
        while(Memory.chemHistory.length > Const.LABGROUP_HISTORY_SIZE)
            Memory.chemHistory.shift();

        Memory.chemistry.lastSwitchT = Game.time;
    }

    // Invoked to construct a new lab group object.
    constructor(roomObj, labs)
    {
        this.m_roomObj = roomObj;
        this.m_labs    = labs;

        // There are two different lab configurations we support.
        // (And each can be in both a horizontal and vertical variant)

        // L7 configuration:
        //
        //    L..L
        //    .RR..
        //    L..L
        //
        // L8 configuration:
        //     LL
        //    L..L
        //    .RR.
        //    L..L
        //    .LL.

        //
        // Key: R = Reagent lab
        //      L = Worker lab
        //      . = road
        //
        // At the moment we don't really care where the roads are.
        // example only.

        // To discover the reagent lab locations to differentiate them
        // from the others, we use this symmetry and find the ones in the
        // middle.

        // If anything doesn't quite match up exactly to these configurations,
        // we simply don't process.  That includes when we're first building
        // L7 labs or expanding to L8 configuration.

        // Check and discover the configuration first, setting an invalid flag
        // unless we prove it good.
        this.m_valid = false;

        if(labs.length !=3 && labs.length != 6 && labs.length != 10)
            return;
        if(!roomObj.getTerminal() || !roomObj.getSpawnStorage())
            return;

        let sumx=0;
        let sumy=0;
        for(let li=0; li<labs.length; li++){
            sumx+=labs[li].pos.x;
            sumy+=labs[li].pos.y;
        }
        let midXlow  = Math.floor(sumx/labs.length);
        let midXhigh = Math.ceil(sumx/labs.length);
        let midYlow  = Math.floor(sumy/labs.length);
        let midYhigh = Math.ceil(sumy/labs.length);

        // Separate reagent and worker labs
        this.m_reagentLabs = [];
        this.m_workerLabs = [];

        if(labs.length == 3){
            for(let li=0; li<labs.length; li++){
                for( let lj=li+1; lj < labs.length; lj++){
                    if(lj == li)
                        continue;
                    let labi = labs[li];
                    let labj = labs[lj];

                    if(     ( Math.abs(labi.pos.x - labj.pos.x) == 1
                              && labi.pos.y == labj.pos.y
                            )
                        ||  ( Math.abs(labi.pos.y - labj.pos.y) == 1
                              && labi.pos.x == labj.pos.x
                            )
                        ){
                        this.m_reagentLabs.push(labi);
                        this.m_reagentLabs.push(labj);
                        for( let lk=0; lk<labs.length; lk++){
                            if( lk == li || lk == lj )
                                continue;
                            this.m_workerLabs.push(labs[lk]);
                        }
                    }
                }
            }
        }
        else if(midXhigh == midXlow+1  && midYlow == midYhigh){
            //.. horizontal config
            for(let li=0; li<labs.length; li++){
                let lab = labs[li];
                let px = lab.pos.x;
                let py = lab.pos.y;

                if( (px == midXlow && py == midYlow ) )
                    this.m_reagentLabs[0]=lab;
                else if( px == midXhigh && py == midYlow )
                    this.m_reagentLabs[1]=lab;
                else if ( px < midXlow && px == (midXlow-1)
                          && (Math.abs(py - midYlow) == 1)
                        )
                    this.m_workerLabs.push(lab);
                else if( px > midXhigh
                         && px == (midXhigh+1)
                         && Math.abs(py - midYlow) == 1
                        )
                    this.m_workerLabs.push(lab);
                else if( ( px == midXlow || px == midXhigh )
                         && Math.abs(py-midYlow) == 2
                        )
                    this.m_workerLabs.push(lab);
                else
                    console.log('WARN! Misplaced lab room: '+lab.pos+' minXlo='+midXlow+' midXhi='+midXhigh+' midY='+midYlow);
            }
        }
        else if ( midYhigh == midYlow+1 && midXlow == midXhigh) {
            //.. vertical config
            for(let li=0; li<labs.length; li++){
                let lab = labs[li];
                let px = lab.pos.x;
                let py = lab.pos.y;

                if( (py == midYlow && px == midXlow ) )
                    this.m_reagentLabs[0]=lab;
                else if( py == midYhigh && px == midXlow )
                    this.m_reagentLabs[1]=lab;
                else if ( py < midYlow && py == (midYlow-1)
                          && (Math.abs(px - midXlow) == 1)
                        )
                    this.m_workerLabs.push(lab);
                else if( py > midYhigh
                         && py == (midYhigh+1)
                         && Math.abs(px - midXlow) == 1
                        )
                    this.m_workerLabs.push(lab);
                else if( ( py == midYlow || py == midYhigh )
                         && Math.abs(px-midXlow) == 2
                        )
                    this.m_workerLabs.push(lab);
                else
                    console.log('WARN! Misplaced lab room: '+lab.pos+' minYlo='+midYlow+' midYhi='+midYhigh+' midXlow='+midXlow);
            }
        }
        else {
            console.log('WARN! '+roomObj.m_room.name+' labs fails lab checks on centering');
            return;
        }

        if(    this.m_reagentLabs.length == 2
            && this.m_workerLabs.length >= 1
          ){
            this.m_valid = true;
        }
        else {
            let sites = roomObj.getSites();
            if(!sites || sites.length == 0)
                console.log('WARN! '+roomObj.m_room.name+' labs fail checks reagLabs='+this.m_reagentLabs.length+' workLabs='+this.m_workerLabs.length);
            return;
        }

        // We'll run reactions next.  But before we do, check if our load list
        // is fully loaded.  If not, reactions will populate the labs with
        // the wrong mineral and we need to leave them free.
        let loadList = Preference.loadList;
        let rmem = this.m_roomObj.m_rmem;
        if(   Preference.warPrep
           || ( rmem.assaultLastT && (Game.time - rmem.assaultLastT) <= Const.GENERAL_ASSAULT_DEFENCE_DURATION )
           ){
            for(let li=0; li<loadList.length; li++){
                let wi;
                for(wi=0; wi<this.m_workerLabs.length; wi++){
                    let lab = this.m_workerLabs[wi];
                    if(lab.mineralAmount && lab.mineralAmount > 0 && lab.mineralType == loadList[li])
                        break;
                }
                if(wi == this.m_workerLabs.length)
                    return;
            }
        }

        // Now that we've got the topology established, run reactions.
        // First, check if reagents are populated and figure out how many
        // reactions could run.
        let nReactions;
        for(let ri=0; ri<2; ri++){
            let lab = this.m_reagentLabs[ri];
            if(!lab.mineralType
                || lab.mineralType != g_reagents[ri]
                || lab.mineralAmount < 5
              ){
                nReactions=0;
                break;
            }
            if( !nReactions ||  (lab.mineralAmount / 5) < nReactions )
                nReactions = Math.floor(lab.mineralAmount / 5);
        }

        for(let wi=0; nReactions > 0 && wi<this.m_workerLabs.length; wi++){
            let lab = this.m_workerLabs[wi];

            if(lab.cooldown && lab.cooldown != 0)
                continue;
            if(lab.mineralType && lab.mineralType != g_product)
                continue;
            if(lab.mineralAmount == lab.mineralCapacity)
                continue;
            let rc = lab.runReaction(this.m_reagentLabs[0], this.m_reagentLabs[1]);
            if(!rc)
                nReactions--;
            if(rc){
                console.log('WARN: lab at '+lab.pos+' failed run reaction rc='+rc);
            }
        }
    }

    // Returns a goods movement order for chemist to follow.
    getChemistOrder()
    {
        let order;
        order = this.getChemistOrderTerminalToLab();
        if(order)
            return order;
        order = this.getChemistOrderLabToTerminal();
        return order;
    }

    // Returns a goods movement order from terminal to lab.
    // Also returns orders to carry to nukers.
    getChemistOrderTerminalToLab()
    {
        if(!this.m_valid)
            return null;

        let room = this.m_roomObj.m_room;
        let rmem = this.m_roomObj.m_rmem;
        let trm = this.m_roomObj.getTerminal();
        let sto = this.m_roomObj.getSpawnStorage();
        if(!trm)
            return null;

        // Check reagent locations first.
        for(let ri=0; ri<2; ri++){
            let lab = this.m_reagentLabs[ri];
            let reg = g_reagents[ri];

            // make sure it has appropriate good or a lab->terminal order needs
            // to flush it.
            if(!reg || (lab.mineralType && lab.mineralType != reg))
                continue;
            if(lab.mineralAmount && lab.mineralAmount > 200)
                continue;

            if( (!trm.store[reg] && !sto.store[reg]) )
                continue;

            return { src: 'terminal', good: reg, tgt: lab.id };
        }

        // Other labs we'll try to stuff with war load list, but we'll
        // 'produce' into any lab that is either empty or matching our
        // target reagent.

        // Next try to satisfy war load list
        // walk through each reagent on the 'load' list and make sure
        // there is a terminal serving it and see if it needs more of
        // something.
        let loi, lai;
        let loadList = Preference.loadList;

        // Focus on production unless we have a war need to load.
        if(   !Preference.warPrep 
           && ( !rmem.assaultLastT || (Game.time - rmem.assaultLastT) > Const.GENERAL_ASSAULT_DEFENCE_DURATION )
           ){
            loadList = [];
        }

        for(loi=0; loi<loadList.length; loi++){
            let lai;
            let emptyIdx=-1;
            let loadGood = loadList[loi];
            let found = false;

            if(!trm.store[loadGood] || trm.store[loadGood] < 1)
                continue;

            for(lai=0; lai<this.m_workerLabs.length; lai++)
            {
                let lab = this.m_workerLabs[lai];

                if(lab.energy < lab.energyCapacity)
                    return { src: 'terminal', good: RESOURCE_ENERGY, tgt: lab.id };

                if(lab.mineralType == loadGood){
                    if(    (lab.mineralType == g_product && lab.mineralAmount < (lab.mineralCapacity-500))
                        || (lab.mineralType != g_product && lab.mineralAmount < lab.mineralCapacity)
                       ){

                        if(loadGood != g_product){
                            // Make sure this is the only one matching -- unless we are producing it
                            // (in which case we'll be pushing into many labs)
                            // If the only match, fill it, else return no order and let
                            // the chemist drain one
                            for(let laj=0; laj<this.m_workerLabs.length;laj++){
                                let labj = this.m_workerLabs[laj];
                                if(lai==laj)
                                    continue;
                                if(labj.mineralType == loadGood)
                                    return null;
                            }
                            return { src: 'terminal', good: loadGood, tgt: lab.id };
                        }
                    }
                    found = true;
                    break;
                }

                if( (!lab.mineralAmount) || (lab.mineralAmount == 0))
                    emptyIdx=lai;
            }

            // If we didn't find a matching lab, but found an empty one, load it.
            if(!found && lai == this.m_workerLabs.length && emptyIdx != -1)
                return { src: 'terminal', good: loadList[loi], tgt: this.m_workerLabs[emptyIdx].id };
        }

        // Check if any lab at all needs energy feeds.
        for(let li=0; li<this.m_labs.length; li++){
            let lab = this.m_labs[li];
            if(trm.store[RESOURCE_ENERGY] > 100 && lab.energy < lab.energyCapacity)
                return { src: 'terminal', good: RESOURCE_ENERGY, tgt: lab.id };
        }

        // Check if any nuker needs filling
        let nuk = this.m_roomObj.getNuker();
        if(nuk){
            if (nuk.energy < nuk.energyCapacity && trm.store[RESOURCE_ENERGY] > 30000)
                return { src: 'terminal', good: RESOURCE_ENERGY, tgt: nuk.id };
            if (nuk.ghodium < nuk.ghodiumCapacity && trm.store[RESOURCE_GHODIUM] > 100)
                return { src: 'terminal', good: RESOURCE_GHODIUM, tgt: nuk.id };
        }
        return null;
    }

    // Returns a goods movement order from labs to storage
    getChemistOrderLabToTerminal()
    {
        if(!this.m_valid)
            return null;

        let room = this.m_roomObj.m_room;
        let rmem = this.m_roomObj.m_rmem;

        // Check if reagents mismatch production target.  If so, drain.
        for(let ri=0; ri<2; ri++){
            let lab = this.m_reagentLabs[ri];

            if(!lab.mineralType)
                continue;
            if(lab.mineralType != g_reagents[ri] && lab.mineralAmount > 0)
                return { src: lab.id, good: lab.mineralType, tgt: 'terminal' };
        }

        // For worker labs, we drain all minerals that aren't on our load list and
        // or are our production target.
        //  If the production target is on the load list, drain once it's 50% full.
        // Allowing us to both produce and keep some around.
        let loadList = Preference.loadList;

        // Focus on production unless we have a war need to load.
        if(   !Preference.warPrep 
           && ( !rmem.assaultLastT || (Game.time - rmem.assaultLastT) > Const.GENERAL_ASSAULT_DEFENCE_DURATION )
           ){
            loadList = [];
        }

        // Check to see if all chems on load list are present.  If not, we need
        // to be more proactive about making space, moving out chemicals that
        // were in production to make room for load list.
        let allPresent = true;
        for(let li=0; li<loadList.length; li++){
            let wi;
            for(wi=0; wi<this.m_workerLabs.length; wi++){
                let lab = this.m_workerLabs[wi];
                if(lab.mineralAmount && lab.mineralAmount > 0 && lab.mineralType == loadList[li])
                    break;
            }
            if(wi == this.m_workerLabs.length) {
                allPresent = false;
                break;
            }
        }

        for(let wi=0; wi<this.m_workerLabs.length; wi++){
            let lab = this.m_workerLabs[wi];
            let onList = false;

            // If the lab has minerals see if that mineral is on load list.
            for(let loi=0; loi<loadList.length; loi++){
                if(loadList[loi] == lab.mineralType){
                    onList = true;
                    break;
                }
            }

            // If mineral is our product, drain if over 100 units.  Unless it's on
            // loadlist, in which case we leave a gap of 100-400 units below capacity
            // for production.
            if(lab.mineralType == g_product){
                if(    (onList && (lab.mineralAmount >= (lab.mineralCapacity-100)) )
                   ||  (!onList && ((!allPresent && lab.mineralAmount>0) || lab.mineralAmount >= 100))
                   )
                    return { src: lab.id, good: lab.mineralType, tgt: 'terminal' };

                // We want to leave one lab full for loading, but also move goods back
                // from the others.  If this lab isn't the one with the most of the
                // good, then move content back to storage.
                if(onList && (!allPresent || lab.mineralAmount >= 300)){
                    let maxj=0;
                    let maxjidx=-1;

                    for(let wj=0; wj<this.m_workerLabs.length; wj++){
                        let labj = this.m_workerLabs[wj];

                        if(labj.mineralType != g_product)
                            continue;
                        if(labj.mineralAmount > maxj){
                            maxj = labj.mineralAmount;
                            maxjidx = wj;
                        }
                    }

                    if(lab.mineralAmount < maxj || wi != maxjidx)
                        return { src: lab.id, good: lab.mineralType, tgt: 'terminal' };
                }
            }

            else if(onList){
                // For minerals on load list (that aren't our product), make sure that
                // we only have one lab handling that mineral.  Drain any others.
                let foundIdx=-1;
                let foundCt=0;
                let foundAmt;

                for(let wj=(wi+1); wj<this.m_workerLabs.length; wj++)
                {
                    let labj = this.m_workerLabs[wj];
                    if(!labj.mineralType)
                        continue;
                    if(labj.mineralType == lab.mineralType && labj.mineralAmount > 0)
                        return { src: labj.id, good: labj.mineralType, tgt: 'terminal' };
                }
            }
            else if (lab.mineralAmount > 0)
                return { src: lab.id, good: lab.mineralType, tgt: 'terminal' };
        }
        return null;
    }
};

module.exports = LabGroup;
