import mongoose from "mongoose";
import { Video } from "../models/video.models.js";
import { User } from "../models/user.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

    const match = {};
    if (query) {
        match.$or = [
            { title: { $regex: query, $options: "i" } },
            { description: { $regex: query, $options: "i" } },
        ];
    }

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        match.owner = mongoose.Types.ObjectId(userId);
    }

    const sort = {};
    if (sortBy && sortType) {
        sort[sortBy] = sortType === "asc" ? 1 : -1;
    } else {
        sort.createdAt = -1; // default sort by createdAt descending
    }

    const aggregate = Video.aggregate([
        { $match: match },
        { $sort: sort },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "owner",
            },
        },
        {
            $addFields: {
                owner: { $arrayElemAt: ["$owner", 0] },
            },
        },
    ]);

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
    };

    const videos = await Video.aggregatePaginate(aggregate, options);
    return res.status(200).json(new ApiResponse(200, videos, "Videos fetched successfully"));
});

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description, duration } = req.body;
    const { videoFile, thumbnail } = req.files;

    if (!title || !description || !videoFile || !thumbnail || !duration) {
        throw new ApiError(400, "All fields are required");
    }

    const videoUrl = await uploadOnCloudinary(videoFile[0].path);
    const thumbnailUrl = await uploadOnCloudinary(thumbnail[0].path);

    const video = await Video.create({
        title,
        description,
        duration,
        videoFile: videoUrl.url,
        thumbnail: thumbnailUrl.url,
        owner: req.user._id,
    });

    return res.status(201).json(new ApiResponse(201, video, "Video published successfully"));
});

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findById(videoId).populate("owner", "username fullName avatar");

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    return res.status(200).json(new ApiResponse(200, video, "Video fetched successfully"));
});

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const {title,description}=req.body
    if(!videoId)
        {
            throw new ApiError(400,"Video Id is required")
        }
    if([title,description].some(fields=>fields.trim()===""))
        {
            throw new ApiError(400,"Title and Descreption is required")
        }

        const thumbnailLocalPath=req.file?.path
        if(!thumbnailLocalPath)
            {
                throw new ApiError(400,"Thumbnail is required")
            }
        const thumbnail=await uploadOnCloudinary(thumbnailLocalPath)

        if(!thumbnail)
            {
                throw new ApiError(500,"There was Problem while uploading Thumbnail on cloud")
            }

        const updatedVideo=await Video.findByIdAndUpdate(videoId,{
            $set:{
                 title,description,thumbnail:thumbnail.url
            }
        },
        {
            new:true
        }
    )
    if(!updatedVideo)
        {
            throw new ApiError(500,"Video was not Updated Due to some error")
        }

        return res.status(200).json(new ApiResponse(200,updatedVideo,"Video was updated successfully"))
});

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    if(!videoId)
        {
            throw new ApiError(400,"Video id is required")
        }
    const deletedVideo=await Video.findByIdAndDelete(videoId)
    if(!deleteVideo)
        {
            throw new ApiError(500,"There was a problem while deleting the video")
        }

        return res.status(200).json(new ApiResponse(200,{},"Video was deleted Successfully"))
   
});

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(videoId)) {
        throw new ApiError(400, "Invalid video ID");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    if (video.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to update this video");
    }

    video.isPublished = !video.isPublished;
    await video.save();

    return res.status(200).json(new ApiResponse(200, video, "Video publish status toggled successfully"));
});

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
};
