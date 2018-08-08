var RoomHolder          = require('RoomHolder');
var Preference          = require('Preference');

// Keep in mind that, in particular for energy, we have quite a bit of
// fluctuation from incoming large omovers.  Better to have some
// variance in levels than wasteful transfers.
const TERMINAL_MIN_TRANSFER_ENERGY=5000;
const TERMINAL_MIN_TRANSFER_OTHER=100;

var g_terminalTotals = null;
var g_allTotals      = null;
var g_goodMin        = null;
var g_goodMinRoom    = null;
var g_goodMax        = null;
var g_goodMaxRoom    = null;
var g_starvedRooms   = null;
var g_nTerminals     = 0;

class TerminalController
{
    // Helper to LabGroup to know what to chemistry to run
    static getTerminalTotals() { return g_terminalTotals; }
    static getAllTotals() { return g_allTotals; }
    static getNTerminals() { return g_nTerminals; }
    static getStarvedRooms() { return g_starvedRooms; }

    static run()
    {
        let allTotals = {};
        let trmTotals = {};
        let goodMin = {};
        let goodMinRoom = {};
        let goodMax = {};
        let goodMaxRoom = {};
        let starvedRooms = {};
        let good;
        let sri;
        let nTerminal = 0;

        // Sum each room's goods to get a (desired) average level.
        let mySpawnRooms = RoomHolder.getMySpawnRooms();
        for(let sri=0; sri<mySpawnRooms.length; sri++){

            let roomObj = mySpawnRooms[sri];
            let terminal  = roomObj.getTerminal();
            let sto       = roomObj.getSpawnStorage();

            if(!terminal)
                continue;
            if(!sto)
                continue;

            nTerminal++;

            let labs = roomObj.getLabs();
            for(let li=0; li<labs.length; li++){
                let lab = labs[li];
                if(lab.mineralType && lab.mineralAmount){
                    good = lab.mineralType;
                    if(!allTotals[good])
                        allTotals[good] = 0;
                    allTotals[good] += lab.mineralAmount;
                }
            }

            let ri;
            for (ri=0; ri<RESOURCES_ALL.length; ri++){
                good = RESOURCES_ALL[ri];

                if(!trmTotals[good])
                    trmTotals[good] = 0;
                if(!allTotals[good])
                    allTotals[good] = 0;
                if(!starvedRooms[good])
                    starvedRooms[good] = 0;

                // If the good is energy, and the room we're analyzing is
                // prioritized, pretend it doesn't exist when calculating totals.
                // That pushes the 'average' energy that the rest of the rooms
                // expect lower, making them willing to push.
                if(good != RESOURCE_ENERGY || roomObj.m_room.name != Preference.prioritizedRoomName){
                    let trmAmt = terminal.store[good];
                    let stoAmt = sto.store[good];

                    if(!trmAmt)
                        trmAmt = 0;
                    if(!stoAmt)
                        stoAmt = 0;

                    trmTotals[good] += trmAmt;
                    allTotals[good] += (trmAmt + stoAmt);

                    if(!goodMin[good] || (goodMin[good] && (trmAmt+stoAmt)<goodMin[good])){
                        goodMin[good] = (trmAmt+stoAmt);
                        goodMinRoom[good] = roomObj.m_room.name;
                    }
                    if(!goodMax[good] || (goodMax[good] && (trmAmt+stoAmt)>goodMax[good])){
                        goodMax[good] = (trmAmt+stoAmt);
                        goodMaxRoom[good] = roomObj.m_room.name;
                    }

                    if(Preference.debugTransfers == 'verbose' && good == 'ZHO2'){
                        console.log('Add room '+roomObj.m_room.name+' rtot='+(trmAmt+stoAmt)+' alltot='+allTotals[good] + ' nterm now='+nTerminal+' avgnow='+allTotals[good]/nTerminal);
                        console.log('... minRoom='+goodMinRoom[good]+'='+goodMin[good]+', maxRoom='+goodMaxRoom[good]+'='+goodMax[good]);
                    }

                    /* Choosing 300 as the threshold here, because we will start lab transactions
                     * if the room average is >= 500.  That leaves a pretty big gap if a room is below
                     * 500 (terminals should be balanced
                     */
                    if( (trmAmt + stoAmt) < 250){
                        starvedRooms[good] += 1;
                    }
                }
            }
        }
        g_terminalTotals = trmTotals;
        g_allTotals    = allTotals;
        g_goodMin      = goodMin;
        g_goodMinRoom  = goodMinRoom;
        g_goodMax      = goodMax;
        g_goodMaxRoom  = goodMaxRoom;
        g_nTerminals   = nTerminal;
        g_starvedRooms = starvedRooms;

        // Each tick pick a single terminal to compare to the other terminals.
        // search for any good that is at least TERMINAL_MIN_TRANSFER units
        // over average in the source terminal and the same under in the destination.
        let spIdx;
        let srObj;
        let srTrm;
        let srSto;

        let tIdx = Game.time%nTerminal;
        let tCt = 0;
        for(spIdx=0; spIdx<mySpawnRooms.length; spIdx++){
            srObj = mySpawnRooms[spIdx];
            srTrm = srObj.getTerminal();
            srSto = srObj.getSpawnStorage();
            if(!srTrm || !srSto)
                continue;
            if(tIdx == tCt)
                break;
            else
                tCt++;
        }

        let found = false;

        // Process any manual trades to friends

        if(!Memory.manualTrades){
            Memory.manualTrades = {}
            Memory.manualTrades.destRoom = 'W15N23';
            Memory.manualTrades.good = 'Z';
            Memory.manualTrades.tgtAmount = 0;
            Memory.manualTrades.sentAmount = 0;
        }

        //if(srObj.m_room.name == 'W8N28')
        //    console.log('T='+Game.time+' W8N28 DBG 1 - Manual trades');

        for(let spj=0; Memory.manualTrades.sentAmount < Memory.manualTrades.tgtAmount && spj<mySpawnRooms.length; spj++){
            let spjObj = mySpawnRooms[spj];
            let spjTrm = spjObj.getTerminal();
            if(!spjTrm)
                continue;
            let good = Memory.manualTrades.good;
            if(spjTrm.store[good] < 2500)
                continue;
            if(spjTrm.cooldown == 0){
                let rc;
                rc = spjTrm.send(good, 2500, Memory.manualTrades.destRoom);
                if(rc == 0){
                    Memory.manualTrades.sentAmount += 2500;
                    if(rc == 0){
                        console.log('2500 Sent from '+spjObj.m_room.name+' total now '+Memory.manualTrades.sentAmount);
                    }
                }
                else {
                    console.log(' rc hmm='+rc+' from '+spjObj.m_room.name);
                }
            }
        }

        // Look for outrageous buy orders
        if(!found && Game.market.credits > Preference.purchaseMinCredits && srTrm && !srTrm.cooldown){
            let allOrders = Game.market.getAllOrders();
            let bestBuy = {};
            let bestBuyOrder = {};
            let bestSell = {};
            let bestSellOrder = {};
            for(let aoi=0; aoi<allOrders.length; aoi++){
                let o = allOrders[aoi];
                if(o.amount < 1000)
                    continue;
                if(!o.roomName){
                    // I think these are generally subscription tokens, which we pretty much want to ignore anyway.
                    continue;
                }
                let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(o.roomName);
                //console.log('Try parse '+o.roomName+' json='+JSON.stringify(parsed));
                let isNPC = ((parsed[1] % 10 === 0) && (parsed[2] % 10 === 0));

                if(!isNPC){
                    //console.log('Skip non NPC order'+o.roomName);
                    continue;
                }

                if(o.type == ORDER_BUY){
                    if(!bestBuy[o.resourceType] || o.price > bestBuy[o.resourceType]) {
                        bestBuy[o.resourceType] = o.price;
                        bestBuyOrder[o.resourceType] = o;
                    }
                }
                else if (o.type == ORDER_SELL){
                    if(!bestSell[o.resourceType] || o.price < bestSell[o.resourceType]){
                        bestSell[o.resourceType] = o.price;
                        bestSellOrder[o.resourceType] = o;
                    }
                }
            }
            /*
            console.log('Best buys: ');
            for(let rsc in bestBuy){
                console.log(rsc+' '+bestBuy[rsc]);
            }
            console.log('Best sells: ');
            for(let rsc in bestSell){
                console.log(rsc+' '+bestSell[rsc]);
            }*/
            let bli;
            for(let rsc in bestSell){
                if(bestSell[rsc] && bestBuy[rsc]
                   && (bestBuy[rsc] - bestSell[rsc]) >= .15
                   && srTrm.store[rsc] <= 20000
                   ){
                    //console.log('Found good deal '+rsc+' sell='+bestSell[rsc]+' buy='+bestBuy[rsc]);
                    for(bli=0; bli<Preference.buyList.length; bli++){
                        if(Preference.buyList[bli] == rsc){
                            break;
                        }
                    }
                    //console.log('Out of loop bli='+bli+' leng='+Preference.buyList.length);
                    if(bli == Preference.buyList.length){
                        // console.log('... skipping '+rsc+', not on buylist');
                    }
                    else {
                        let order = bestSellOrder[rsc];
                        //console.log('..id='+order.id+' amount='+order.amount);
                        let rc = Game.market.deal(order.id, order.amount, srObj.m_room.name);
                        console.log('room '+srObj.m_room.name+' purchased '+order.amount+' '+rsc+' @'+bestSell[rsc]+' vs. bestBuy@'+bestBuy[rsc]);
                        //if(rc == 0){
                        //    Game.notify('Issued good deal trade rsc='+order.resourceType+' price='+order.price+' amount='+order.amount+' bestSell='+bestSell[rsc]+' bestBuy='+bestBuy[rsc]);
                        //}
                        found = true;
                        break;
                    }
                }
            }
        }


        //if(srObj.m_room.name == 'W8N28')
        //    console.log('T='+Game.time+' W8N28 DBG 1 - Sell orders found='+found+' cooldown='+srTrm.cooldown);

        // Find something to sell
        if( !found && srTrm && !srTrm.cooldown && Preference.enableSales  ) {

            let bestOrder;
            let bestCostRatio;
            let bestCost;
            let bestPrice;
            let bestAmount;
            let bestIsNPC;
            let bestRsc;

            for(let rsc in srTrm.store){

                //if(srObj.m_room.name == 'W8N28')
                //    console.log('... consider sale of '+rsc+' store='+srTrm.store[rsc]+' avg='+allTotals[rsc]/nTerminal);
                if(rsc.length > 1 || rsc == 'G')
                    continue;

                // HOW MUCH DO WE WANT TO STOCKIPLE VERSUS SELL?
                // Generally, it's good to stockpile the basic goods so that we never starve
                // chemical production.
                // However... stockpiling lots of each of the 7 basic minerals quickly adds up.
                // Storing 5000 of each good is more than 10% of the terminal capacity.
                //
                // I'll take the approach that we'll store up to 20000 of each good (5000 in terminal, 15000
                // in storage) generally.  but if the terminal exceeds 250K, we'll back this down to
                // 4000 total (1000 in terminal, 3000 in storage).  We'll have to see if that that's 'enough' 
                // in most cases to pad production pretty well (I suspect so).
                let rscAvg = (allTotals[rsc]/nTerminal);
                let targetLevel;

                if(_.sum(srTrm.store) >= 250000)
                    targetLevel = 4000;
                else
                    targetLevel = 20000;

                let roomTot = 0;
                if(srTrm.store[rsc])
                    roomTot += srTrm.store[rsc];
                if(srSto.store[rsc])
                    roomTot += srSto.store[rsc];
                if(roomTot <= targetLevel)
                    continue;
                if(rscAvg <= targetLevel)
                    continue;
                if(!srTrm.store[rsc])
                    continue;

                // Find best order cost
                let orders = Game.market.getAllOrders({type: ORDER_BUY, resourceType: rsc});
                for(let oi=0; oi<orders.length; oi++){
                    let o = orders[oi];

                    if(o.amount < 100)
                        continue;

                    let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(o.roomName);
                    let isNPC = ((parsed[1] % 10 === 0) && (parsed[2] % 10 === 0));

                    if(!isNPC && Preference.npcOnly )
                        continue;
                    if(o.price < .08 && !isNPC)
                        continue;

                    // Our goal is to keep all terminals below 4500.  Don't sell if it would
                    // put us below an average goods level to achieve that.
                    // Our linkers will drop/dispose goods above 5000 if the terminals are getting full, and
                    // this gives us an opportunity to slowly try to selloff before hitting that limit.
                    let oAmount = roomTot - targetLevel;

                    if ( oAmount > srTrm.store[rsc] )
                        oAmount = srTrm.store[rsc];
                    if ( oAmount > o.amount )
                        oAmount = o.amount;

                    let cost = Game.market.calcTransactionCost(oAmount,srObj.m_room.name, o.roomName);
                    let costRatio = cost/oAmount;

                    if( !bestRsc
                        || ( rsc == bestRsc 
                             && ( o.price > bestPrice 
                                  || (bestPrice == o.price && (!bestCostRatio || costRatio<bestCostRatio))
                                )
                           )
                        || ( rsc != bestRsc && oAmount > bestAmount )
                      ) {
                        bestOrder=o;
                        bestIsNPC = isNPC;
                        bestCostRatio=costRatio;
                        bestRsc=rsc;
                        bestCost=cost;
                        bestPrice=o.price;
                        bestAmount=oAmount;
                        //console.log('New best rsc='+bestRsc+' price='+o.price+' cost='+cost+' costRatio='+costRatio+ ' rsc='+rsc+' amount='+oAmount);
                    }
                }
            }

            if(bestOrder) {
                let rc=Game.market.deal(bestOrder.id, bestAmount, srObj.m_room.name);
                if(rc == 0){
                    console.log(Game.time+' '+ srObj.m_room.name+' Executing sell '+bestAmount
                               +' '+bestOrder.resourceType+' price='+bestOrder.price+' cost='+bestCost
                               +' costRatio='+bestCostRatio+' order amount='+bestOrder.amount
                               +' id='+bestOrder.id
                               +' toRoom='+bestOrder.roomName
                               +' termStore='+srTrm.store[bestRsc]
                               +' energy='+srTrm.store[RESOURCE_ENERGY]
                               );
                    found = true;
                }
                else{
                    console.log('RC='+rc+' amount='+bestAmount+' o.amount='+bestOrder.amount+' oid='+bestOrder.id+' good='+bestOrder.resourceType+' srTrmStore='+srTrm.store[rsc]);
                }
            }
        }

        //if(srObj.m_room.name == 'W8N28')
        //    console.log('T='+Game.time+' W8N28 DBG 1 - Balancing found='+found+' cooldown='+srTrm.cooldown);

        if( true && !found && srTrm && !srTrm.cooldown ){
            // Focus on finding which of our goods are farthest above terminal average,
            // and finding a home for that good.
            let bestDiff;
            let bestGood;
            let bestAvg;

            if(Preference.debugTransfers == 'verbose')
                console.log('Finding best good for room '+srObj.m_room.name);

            for(let good in srTrm.store){
                // Don't balance chemicals in production - too much churn.
                // Wait for cycle to complete and balance in bulk.
                //   While we're checking, this is also a good time to check if
                // the chemistry cycle should be completed.
                if(Memory.chemistry){
                    if(good == Memory.chemistry.product) {
                        if(good.length <= 4 && allTotals[good]/nTerminal >= 1750){
                            console.log('T='+Game.time+' Terminating production cycle.  Product '+good+' avgLevel='+allTotals[good]/nTerminal);
                            delete Memory.chemistry;
                        }
                        else if(Game.time%50==0)
                            console.log('T='+Game.time+' Continuing production cycle.  Product '+good+' avgLevel='+allTotals[good]/nTerminal);
                        continue;
                    }
                    if(good == Memory.chemistry.r1 || good == Memory.chemistry.r2){
                        if(allTotals[good]/nTerminal < 450){
                            console.log('T='+Game.time+' Terminating production cycle.  Good '+good+' avgLevel='+allTotals[good]/nTerminal);
                            delete Memory.chemistry;
                        }
                        else if(Game.time%50==0)
                            console.log('T='+Game.time+' Continuing production cycle.  Good '+good+' avgLevel='+allTotals[good]/nTerminal);

                        continue;
                    }
                }

                let sAmt   = (srTrm.store[good] + srSto.store[good]);
                let sStoAmt = (srSto.store[good]);
                let sTrmAmt = (srTrm.store[good]);

                let labs = srObj.getLabs();
                let labAmt = 0;
                for(let li=0; li<labs.length; li++){
                    let lab = labs[li];
                    if(lab.mineralType && lab.mineralAmount){
                        if(lab.mineralType != good)
                            continue;
                        labAmt += lab.mineralAmount;
                    }
                }

                if(!sStoAmt)
                    sStoAmt = 0;
                if(!sTrmAmt)
                    sTrmAmt = 0;
                sAmt = (sStoAmt + sTrmAmt + labAmt);

                let avgAmt = allTotals[good]/nTerminal;

                if(Preference.debugTransfers == 'verbose')
                    console.log('.... good='+good+' roomAmount='+sAmt+' average='+avgAmt);


                // Don't transfer energy out of the prioritized room - we want it to get glutted.
                if(good == RESOURCE_ENERGY && srObj.m_room.name == Preference.prioritizedRoomName)
                    continue;

                let sDiff = 0;
                if(sAmt > avgAmt)
                    sDiff = (sAmt - avgAmt);
                if (good != RESOURCE_ENERGY && sDiff > 0 && sDiff < 100 && (avgAmt - goodMin[good]) >= 200){
                    // Comparing a room to the average alone isn't enough, because a 'new' room will be far below the
                    // average and with many rooms won't influence the average significantly.  So we need to 
                    // have rooms above average volunteer to bring themselves below average to satisfy the need and
                    // bring down the average as a whole.
                    sDiff = 100;
                }

                if(Preference.debugTransfers == 'verbose')
                    console.log('Consider '+good+' sDiff='+sDiff+' amt='+sAmt+' avg='+avgAmt+' goodMin='+goodMin[good]);

                if(sDiff >= 100){
                    if(!bestDiff || sDiff > bestDiff){
                        if(good != RESOURCE_ENERGY || sDiff >= 2500){
                            if(Preference.debugTransfers == 'verbose')
                                console.log('.... newBest good='+good+' diff='+sDiff+' amt='+avgAmt);

                            bestGood = good;
                            bestDiff = sDiff;
                            bestAvg  = avgAmt;
                        }
                    }
                }
            }

            if(Preference.debugTransfers == 'verbose')
                console.log('Consider xfer room'+srObj.m_room.name+' bestGood='+bestGood+' diff='+bestDiff+' avg='+bestAvg);

            // Don't waste our time if we're less than 100 units off average
            // Else find what other room has the lowest amount of this good.
            if(bestDiff >= 100){
                let lowestTrm;
                let lowestObj;
                let lowestSto;
                let lowestAmt;
                let lowestDiff;
                for(let dti=0; !found && dti<mySpawnRooms.length; dti++){
                    if(dti == spIdx)
                        continue;

                    let dtObj = mySpawnRooms[dti];
                    let dtSto = dtObj.getSpawnStorage();
                    let dtTrm = dtObj.getTerminal();

                    if(!dtTrm || !dtSto)
                        continue;

                    if(_.sum(dtTrm.store) >= 295000)
                        continue;

                    // Check if the target room needs this good (it's capacity is below average).
                    // But note that we want the prioritized room to receive all the energy rooms are willing to push.
                    let dtTrmAmt;
                    let dtStoAmt;
                    let dtAmt;

                    dtTrmAmt = dtTrm.store[bestGood];
                    dtStoAmt = dtSto.store[bestGood];
                    if(!dtTrmAmt)
                        dtTrmAmt = 0;
                    if(!dtStoAmt)
                        dtStoAmt = 0;
                    dtAmt = dtStoAmt + dtTrmAmt;

                    if(   (dtObj.m_room.name != Preference.prioritizedRoomName || bestGood != RESOURCE_ENERGY)
                       &&  dtAmt >= bestAvg)
                        continue;

                    if(    (bestGood == RESOURCE_ENERGY && Preference.prioritizedRoomName == dtObj.m_room.name)
                        || (!lowestAmt && lowestAmt != 0)
                        || dtAmt < lowestAmt
                        ){

                        lowestTrm = dtTrm;
                        lowestObj = dtObj;
                        lowestSto = dtSto;
                        lowestAmt = dtAmt;
                        if(!lowestAmt)
                            lowestAmt = 0;
                        lowestDiff = (bestAvg - lowestAmt);

                        if (bestGood == RESOURCE_ENERGY && Preference.prioritizedRoomName == dtObj.m_room.name){
                            lowestAmt = 0;
                            lowestDiff = bestAvg;
                        }
                    }
                }

                if(Preference.debugTransfers == 'verbose')
                    console.log('... lowest='+lowestObj.m_room.name+' amt='+lowestAmt);

                // because the 'diff' is the difference between total amounts including storage,
                // we might not actually have that much in the terminal (yet).  Transfer all that
                // we have (and linkers will refill)
                if(lowestDiff > srTrm.store[bestGood]) {
                    lowestDiff = srTrm.store[bestGood];
                    if(!lowestDiff)
                        lowestDiff = 0;
                }

                if(lowestDiff >= 100){
                    // Now transfer to bring whichever room closest to the average.
                    let amount;
                    amount = (lowestDiff > bestDiff) ? bestDiff : lowestDiff;

                    if(amount > (lowestTrm.storeCapacity - _.sum(lowestTrm.store)) )
                        amount = (lowestTrm.storeCapacity - _.sum(lowestTrm.store));

                    let cost   = Game.market.calcTransactionCost
                                    (amount
                                    ,srObj.m_room.name
                                    ,lowestObj.m_room.name
                                    );
                    let rc=srTrm.send(bestGood, amount, lowestObj.m_room.name);

                    if(Preference.debugTransfers == 'verbose'){
                        console.log('T='+Game.time+' Transfer of '+amount+' '+bestGood+' OK from '
                                    + srObj.m_room.name
                                    + ' to ' + lowestObj.m_room.name
                                    );
                    }
                    if(Preference.debugTransfers == 'verbose'){
                        console.log('..  cost='+cost);
                        console.log('..  source term level = '+srTrm.store[bestGood]);
                        console.log('..  source sto level  = '+srSto.store[bestGood]);
                        console.log('..  source tot level  =  '+(srTrm.store[bestGood] + srSto.store[bestGood]));
                        console.log('..  dest term level   = '+lowestTrm.store[bestGood]);
                        console.log('..  dest sto level    = '+lowestSto.store[bestGood]);
                        console.log('..  dest tot level    =  '+(lowestTrm.store[bestGood] + lowestSto.store[bestGood]));
                        console.log('..  avg = '+bestAvg);
                        console.log('..  rc = '+rc);
                    }
                    found = true;
                }
            }
        }

        // Report incoming transactions for last tick to console.
        let trans = Game.market.incomingTransactions;
        for(let ti=0; ti<trans.length; ti++){
            let tr=trans[ti];
            if(tr.time >= (Game.time-1)){

                // Log the transaction unless it's just an inter-room transfer from another of my rooms.
                let rObj=RoomHolder.get(tr.from);
                if(Preference.debugTransfers || !rObj || !(rObj.m_room) || !(rObj.m_room.controller) || !(rObj.m_room.controller.my)){
                    console.log('T='+tr.time+' '+tr.to+' Transaction received '+tr.amount+' '+tr.resourceType+' from '+tr.from);
                }
            }
            else
                break;
        }


        ///----------------------------------------------
        // Place sell orders if we're glutted.
        // For the selected terminal's room, figure out what orders are already outstanding, by room, for that good.
        let openOrders = {};
        for(let oid in Game.market.orders){
            let o = Game.market.orders[oid];

            if(o.roomName != srObj.m_room.name)
                continue;
            if(openOrders[o.resourceType])
                console.log('BUG! multiple open orders for room.. ignoring oid='+o.id);
            openOrders[o.resourceType] = o;
        }

        ///----------------------------------------------
        // Not often, but occasionally, delete old dead orders, and lower
        // price on ones that aren't moving.
        //  This is once every 1000 ticks which is roughly once an hourish.
        if(Game.time%1000==987){
            for(let oid in Game.market.orders){
                let o = Game.market.orders[oid];
                if(o && o.remainingAmount == 0){
                    let rc=Game.market.cancelOrder(oid);
                    console.log('CANCELLED ORDER '+oid+' rc='+rc);
                    delete Memory.orders[oid];
                }
                else {
                    if(!Memory.orders)
                        Memory.orders = { };
                    let omem = Memory.orders[oid];

                    if(omem){
                        if(!o.active)
                            console.log('INACTIVE ORDER '+oid);
                        else if (o.remainingAmount == omem.remainingAmount){
                            // Order hasn't moved in an hour.  Tick down the price.
                            let oldPriceFl = Math.floor(o.price*1000);
                            let newPriceFl = oldPriceFl-1;
                            let newPrice = newPriceFl/1000;
                            let rc = Game.market.changeOrderPrice(oid,newPrice);
                            console.log('REDUCED ORDER PRICE '+oid+' newPrice='+newPrice+' oldPrice='+o.price+' rc='+rc);
                        }
                        else {
                            console.log('Order progress '+oid+' lastRemain='+omem.remainingAmount+' new='+o.remainingAmount);
                        }
                    }
                    else {
                        Memory.orders[oid] = { };
                        Memory.orders[oid].remainingAmount = o.remainingAmount;
                    }
                }
            }
        }
    };

};

module.exports = TerminalController;
