#!/bin/bash
#Pulls a new docker image for davidbulnes/stellar-bot:master_<new_commit_sha>, and brings up the new container
#Called from the dockerhub webhook server running on the host system. We can't easily run it through a docker container due to process isolation. 

#TODO: Save previous/current commit sha so that we can run docker rmi on that image

#Validate that our tag is from master
if echo "$TAG" | grep -q "master"; then
    #Set our env variable for the master tag to $TAG, passed from micro-dockerhub-hook/lib/run-script.js
    export STELLARBOT_MASTER_TAG=$TAG
    #Remove the "master_" prefix from the tag to get the commit sha
    COMMIT_SHA=$STELLARBOT_MASTER_TAG%"master_"
    echo "$COMMIT_SHA"
    #Change our path to the relative path where our stellar bot docker-compose.yml resides
    #Needs to be set in /etc/environment to be available outside of just terminal sessions
    cd $STELLARBOT_PATH
    #Fetch and reset our code to the latest commit on master
    git fetch upstream master && git reset --hard $COMMIT_SHA & git clean -df
    docker-compose pull app && docker-compose -f docker-compose.prod.yml up -d
    #Change our path back
    cd -
else
    echo "NOT PULLING: master not found in tag"
fi